import React from "react";
import "../App.css"; // For potential global styles or variables

interface ContextMenuItem {
  label?: string; // Optional for separators
  onClick?: () => void; // Optional for separators or disabled items
  disabled?: boolean;
  isSeparator?: boolean; // For adding a line separator
}

interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  menuItems: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  x,
  y,
  menuItems,
  onClose,
}) => {
  if (!isOpen || menuItems.length === 0) return null;

  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: y,
    left: x,
    backgroundColor: "var(--app-button-bg-color)", // Using existing var, can be more specific
    border: "1px solid var(--app-border-color)",
    borderRadius: "4px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
    zIndex: 1000, // Ensure it's on top
    padding: "5px 0",
    minWidth: "150px",
  };

  const itemStyle: React.CSSProperties = {
    padding: "8px 15px",
    cursor: "pointer",
    color: "var(--app-button-text-color)",
    fontSize: "0.9em",
  };

  const itemHoverStyle: React.CSSProperties = {
    backgroundColor: "var(--app-primary-color)",
    color: "var(--app-list-item-selected-text)",
  };

  const separatorStyle: React.CSSProperties = {
    height: "1px",
    backgroundColor: "var(--app-border-color)",
    margin: "5px 0",
  };

  const disabledStyle: React.CSSProperties = {
    color: "var(--app-text-color-secondary)",
    cursor: "not-allowed",
  };

  // Handle click outside to close menu
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) {
        return;
      }
      onClose();
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  return (
    <div ref={menuRef} style={menuStyle}>
      {menuItems.map((item, index) => {
        if (item.isSeparator) {
          return <div key={`sep-${index}`} style={separatorStyle} />;
        }
        return (
          <div
            key={item.label ? item.label + index : `item-${index}`}
            style={{
              ...itemStyle,
              ...(item.disabled ? disabledStyle : {}),
            }}
            onClick={() => {
              if (!item.disabled) {
                item.onClick?.();
                onClose();
              }
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.currentTarget as HTMLDivElement).style.backgroundColor =
                  itemHoverStyle.backgroundColor!;
                (e.currentTarget as HTMLDivElement).style.color =
                  itemHoverStyle.color!;
              }
            }}
            onMouseLeave={(e) => {
              if (!item.disabled) {
                (e.currentTarget as HTMLDivElement).style.backgroundColor =
                  "transparent"; // Or initial background
                (e.currentTarget as HTMLDivElement).style.color =
                  itemStyle.color!;
              }
            }}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
};

export default ContextMenu;
