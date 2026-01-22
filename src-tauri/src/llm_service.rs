/**
 * LLM Service using ONNX Runtime
 *
 * Handles loading ONNX models and generating text with token streaming.
 *
 * Note: This is a simplified implementation. Full LLM inference with ONNX
 * requires proper model architecture support (decoder-only transformers).
 */

use ort::session::Session;
use ort::value::Value;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user", "assistant", "system"
    pub content: String,
}

pub struct LLMService {
    session: Arc<Mutex<Option<Session>>>,
    tokenizer: Arc<Mutex<Option<tokenizers::Tokenizer>>>,
    current_model_path: Arc<Mutex<Option<String>>>,
    interrupt_flag: Arc<StdMutex<bool>>,
    device: Arc<Mutex<String>>, // "cpu", "cuda", "metal"
}

impl LLMService {
    // Helper method that acquires the lock internally to avoid Send issues
    pub async fn load_model_locked(
        state: Arc<Mutex<Self>>,
        model_path: String,
        app: tauri::AppHandle,
    ) -> Result<(), String> {
        let service = state.lock().await;
        service.load_model(model_path, app).await
    }

    // Helper method that acquires the lock internally to avoid Send issues
    pub async fn generate_locked(
        state: Arc<Mutex<Self>>,
        prompt: String,
        messages: Vec<ChatMessage>,
        app: tauri::AppHandle,
    ) -> Result<String, String> {
        let mut service = state.lock().await;
        service.generate(prompt, messages, app).await
    }
    pub fn new() -> Result<Self, String> {
        // Initialize ort environment (global, one-time setup)
        ort::init()
            .with_name("proassist-llm")
            .commit();

        Ok(Self {
            session: Arc::new(Mutex::new(None)),
            tokenizer: Arc::new(Mutex::new(None)),
            current_model_path: Arc::new(Mutex::new(None)),
            interrupt_flag: Arc::new(StdMutex::new(false)),
            device: Arc::new(Mutex::new("cpu".to_string())),
        })
    }

    fn resolve_model_path(model_path: &str, app: &tauri::AppHandle) -> Result<PathBuf, String> {
        let path = PathBuf::from(model_path);
        if path.is_absolute() {
            return Ok(path);
        }

        let base_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

        Ok(base_dir.join("offline-models").join(path))
    }

    pub async fn load_model(&self, model_path: String, app: tauri::AppHandle) -> Result<(), String> {
        let resolved_path = Self::resolve_model_path(&model_path, &app)?;
        let resolved_path_str = resolved_path.to_string_lossy().to_string();

        // Check if model is already loaded
        {
            let current_path = self.current_model_path.lock().await;
            if current_path.as_ref() == Some(&resolved_path_str) {
                let session = self.session.lock().await;
                if session.is_some() {
                    app.emit(
                        "llm-status",
                        serde_json::json!({
                            "status": "ready",
                            "message": "Model already loaded",
                            "device": *self.device.lock().await
                        }),
                    )
                    .map_err(|e| format!("Failed to emit status: {}", e))?;
                    return Ok(());
                }
            }
        }

        // Emit loading status
        app.emit(
            "llm-status",
            serde_json::json!({
                "status": "loading",
                "message": "Loading ONNX model..."
            }),
        )
        .map_err(|e| format!("Failed to emit status: {}", e))?;

        // Detect execution provider
        let execution_providers = Self::detect_execution_providers();
        let device = execution_providers.first().unwrap_or(&"cpu".to_string()).clone();

        {
            let mut device_guard = self.device.lock().await;
            *device_guard = device.clone();
        }

        app.emit(
            "llm-status",
            serde_json::json!({
                "status": "loading",
                "message": format!("Using {} execution provider", device)
            }),
        )
        .map_err(|e| format!("Failed to emit status: {}", e))?;

        // Build session using Session::builder()
        // Read model file into memory first
        let model_data = std::fs::read(&resolved_path)
            .map_err(|e| format!("Failed to read model file: {}", e))?;
        
        let session = Session::builder()
            .map_err(|e| format!("Failed to create session builder: {}", e))?
            .commit_from_memory(&model_data)
            .map_err(|e| {
                format!(
                    "Failed to load ONNX model from {}: {}",
                    resolved_path.display(),
                    e
                )
            })?;

        // Store session directly (not in Arc since we need mutable access)

        // Try to load tokenizer (look for tokenizer.json in same directory)
        // Tokenizer is required for text generation
        let tokenizer_path = resolved_path
            .parent()
            .ok_or("Invalid model path")?
            .join("tokenizer.json");

        let tokenizer = if tokenizer_path.exists() {
            // Check file size first - corrupted files are often 0 bytes or very small
            let metadata = std::fs::metadata(&tokenizer_path)
                .map_err(|e| format!("Failed to read tokenizer file metadata: {}", e))?;
            
            if metadata.len() == 0 {
                return Err("Tokenizer file is empty. Please re-download the model.".to_string());
            }
            
            if metadata.len() < 1000 {
                // Very small tokenizer files are likely corrupted
                app.emit(
                    "llm-status",
                    serde_json::json!({
                        "status": "loading",
                        "message": format!("Warning: Tokenizer file is very small ({} bytes). It may be corrupted.", metadata.len())
                    }),
                )
                .ok();
            }
            
            match tokenizers::Tokenizer::from_file(&tokenizer_path) {
                Ok(t) => {
                    app.emit(
                        "llm-status",
                        serde_json::json!({
                            "status": "loading",
                            "message": "Tokenizer loaded successfully"
                        }),
                    )
                    .ok();
                    Some(t)
                }
                Err(e) => {
                    // Tokenizer is required - fail with helpful error
                    let error_msg = format!(
                        "Failed to load tokenizer: {}. The tokenizer.json file may be corrupted or incomplete. Please delete the model files and re-download them.",
                        e
                    );
                    app.emit(
                        "llm-status",
                        serde_json::json!({
                            "status": "error",
                            "message": error_msg.clone()
                        }),
                    )
                    .ok();
                    return Err(error_msg);
                }
            }
        } else {
            return Err("Tokenizer file (tokenizer.json) not found. Please ensure the model was downloaded completely.".to_string());
        };

        // Store loaded model
        {
            let mut session_guard = self.session.lock().await;
            *session_guard = Some(session);

            let mut tokenizer_guard = self.tokenizer.lock().await;
            *tokenizer_guard = tokenizer;

            let mut path_guard = self.current_model_path.lock().await;
            *path_guard = Some(resolved_path_str);
        }

        app.emit(
            "llm-status",
            serde_json::json!({
                "status": "ready",
                "message": "Model loaded successfully",
                "device": device
            }),
        )
        .map_err(|e| format!("Failed to emit status: {}", e))?;

        Ok(())
    }

    pub async fn generate(
        &mut self,
        prompt: String,
        messages: Vec<ChatMessage>,
        app: tauri::AppHandle,
    ) -> Result<String, String> {
        // Reset interrupt flag
        {
            let mut flag = self.interrupt_flag.lock().unwrap();
            *flag = false;
        }

        // Ensure a model is loaded - we need mutable access for run()
        let mut session_guard = self.session.lock().await;
        let session = session_guard.as_mut().ok_or("Model not loaded. Please load a model first.")?;

        let tokenizer = {
            let guard = self.tokenizer.lock().await;
            guard.clone()
        };

        // Emit start status
        app.emit(
            "llm-status",
            serde_json::json!({
                "status": "start",
                "message": "Starting generation..."
            }),
        )
        .map_err(|e| format!("Failed to emit status: {}", e))?;

        let prompt_messages = if messages.is_empty() {
            vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
            }]
        } else {
            messages
        };

        // Format messages into prompt
        let prompt = Self::format_messages(&prompt_messages);

        // Tokenize input - tokenizer is optional, but needed for text generation
        let tokenizer = match tokenizer {
            Some(t) => t,
            None => {
                return Err("Tokenizer not available. Please ensure tokenizer.json is downloaded and valid.".to_string());
            }
        };
        let encoding = tokenizer
            .encode(prompt.clone(), false)
            .map_err(|e| format!("Failed to tokenize input: {}", e))?;

        let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();

        // Run inference in a loop for autoregressive generation
        let mut generated_tokens = Vec::new();
        let mut current_input = input_ids;
        let max_new_tokens = 1024;
        let start_time = std::time::Instant::now();
        let mut token_count = 0;

        for _ in 0..max_new_tokens {
            // Check interrupt flag
            {
                let flag = self.interrupt_flag.lock().unwrap(); // StdMutex, no await needed
                if *flag {
                    break;
                }
            }

            // Prepare input for this iteration
            // Note: ONNX models typically expect shape [batch_size, sequence_length]
            // Create tensor from vector using Value::from_array
            let shape = vec![1, current_input.len()];
            let input_tensor = Value::from_array((shape, current_input.clone()))
                .map_err(|e| format!("Failed to create input tensor: {}", e))?;

            // Run inference with named input
            let outputs = session.run(ort::inputs!["input_ids" => input_tensor])
                .map_err(|e| {
                    format!(
                        "Inference failed: {}. Note: ONNX model may require specific input/output names (expected 'input_ids'). Ensure model is properly formatted for LLM inference.",
                        e
                    )
                })?;

            // Get logits (output tensor) - output name may vary by model
            let (_, logits_value) = outputs
                .iter()
                .next()
                .ok_or("No output from model")?;

            let (_logits_shape, logits_slice) = logits_value
                .try_extract_tensor::<f32>()
                .map_err(|e| format!("Failed to extract logits: {}", e))?;

            // Get the token with highest probability (greedy decoding)
            // logits_shape is [batch_size, seq_len, vocab_size] typically
            let vocab_size = logits_slice.len() / current_input.len();
            let last_token_logits = &logits_slice[(current_input.len() - 1) * vocab_size..];

            let next_token_id = last_token_logits
                .iter()
                .enumerate()
                .max_by(|(_, a): &(usize, &f32), (_, b): &(usize, &f32)| a.partial_cmp(b).unwrap())
                .map(|(idx, _)| idx as i64)
                .ok_or("Failed to find next token")?;

            // Check for EOS token (typically token_id 2 or specific to model)
            if next_token_id == 2 || next_token_id == 0 {
                break;
            }

            generated_tokens.push(next_token_id);
            current_input.push(next_token_id);
            token_count += 1;

            // Decode and emit token
            let token_text = tokenizer
                .decode(&[next_token_id as u32], true)
                .map_err(|e| format!("Failed to decode token: {}", e))?;

            // Calculate tokens per second
            let elapsed = start_time.elapsed().as_secs_f64();
            let tps = if elapsed > 0.0 {
                token_count as f64 / elapsed
            } else {
                0.0
            };

            app.emit(
                "llm-token",
                serde_json::json!({
                    "token": token_text,
                    "tps": tps,
                    "numTokens": token_count
                }),
            )
            .map_err(|e| format!("Failed to emit token: {}", e))?;
        }

        // Decode full response
        let full_text = tokenizer
            .decode(
                &generated_tokens
                    .iter()
                    .map(|&id| id as u32)
                    .collect::<Vec<_>>(),
                true,
            )
            .map_err(|e| format!("Failed to decode response: {}", e))?;

        app.emit(
            "llm-status",
            serde_json::json!({
                "status": "complete",
                "message": "Generation complete"
            }),
        )
        .map_err(|e| format!("Failed to emit status: {}", e))?;

        Ok(full_text)
    }

    pub fn interrupt(&self) {
        let mut flag = self.interrupt_flag.lock().unwrap();
        *flag = true;
    }

    pub fn reset(&self) {
        let mut flag = self.interrupt_flag.lock().unwrap();
        *flag = false;
    }

    fn detect_execution_providers() -> Vec<String> {
        let mut providers = Vec::new();

        // Always fall back to CPU for now
        providers.push("cpu".to_string());

        providers
    }

    fn format_messages(messages: &[ChatMessage]) -> String {
        // Simple formatting - in production, you'd use proper chat templates
        messages
            .iter()
            .map(|msg| match msg.role.as_str() {
                "system" => format!("System: {}\n", msg.content),
                "user" => format!("User: {}\n", msg.content),
                "assistant" => format!("Assistant: {}\n", msg.content),
                _ => format!("{}: {}\n", msg.role, msg.content),
            })
            .collect()
    }
}
