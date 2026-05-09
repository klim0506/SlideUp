import { Icon } from "@/lib/design";
import { DeckSlideThumbCanvas } from "@/lib/slidePreview";
import { useEffect, useState } from "react";

function VersionThumb({
  slide,
  slideIndex,
  total,
  preset,
  active,
  onClick,
  onContextMenu,
  children,
  title,
  disabled = false,
  fadeWhenInactive = true,
  versionLabel = "",
}) {
  const inactiveDim = fadeWhenInactive && !active;
  const opacity = active ? 1 : disabled ? 0.42 : inactiveDim ? 0.5 : 1;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={disabled}
      style={{
        width: 68,
        flexShrink: 0,
        padding: 0,
        border: active ? "1px solid color-mix(in srgb, var(--accent) 28%, var(--line))" : "1px solid transparent",
        borderRadius: 10,
        background: active ? "var(--surface)" : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity,
        boxShadow: active ? "0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent)" : "none",
        position: "relative",
      }}
    >
      <div style={{ width: 68, height: 40, borderRadius: 9, overflow: "hidden", boxShadow: "0 0 0 1px rgba(32,33,36,.08)" }}>
        {children || <DeckSlideThumbCanvas slide={slide} index={slideIndex} total={total} preset={preset} />}
      </div>
      {versionLabel ? (
        <span
          style={{
            position: "absolute",
            top: -5,
            left: -2,
            padding: "1px 6px",
            borderRadius: 999,
            border: "1px solid color-mix(in srgb, var(--line) 82%, white)",
            background: active ? "var(--accent)" : "rgba(255,255,255,.94)",
            color: active ? "white" : "var(--ink-3)",
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            fontWeight: 700,
            lineHeight: 1.25,
            pointerEvents: "none",
          }}
        >
          {versionLabel}
        </span>
      ) : null}
    </button>
  );
}

export function SlideVersionsColumn({
  versionsChrono,
  slideIndex,
  slidesLen,
  preset,
  onActivate,
  onDeleteVersion,
  onPromptAi,
  localAiBusy,
  busy,
  publicView,
  variant = "below",
}) {
  const newestIndex = versionsChrono.length - 1;
  const isBelow = variant === "below";
  const [contextMenu, setContextMenu] = useState(null);
  const canDeleteVersion = !publicView && !busy && versionsChrono.length > 1 && typeof onDeleteVersion === "function";

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", close);
    };
  }, [contextMenu]);

  function openVersionContextMenu(event, versionIndex) {
    if (!canDeleteVersion) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, versionIndex });
  }

  const aiThumb = !publicView ? (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <VersionThumb
        active={false}
        fadeWhenInactive={false}
        disabled={busy || localAiBusy}
        onClick={() => {
          if (!busy && !localAiBusy) onPromptAi?.(newestIndex >= 0 ? newestIndex : 0);
        }}
        title="Подставить промпт для нового варианта"
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--accent) 10%, rgba(255,255,255,.96))",
            color: localAiBusy ? "var(--ink-4)" : "var(--accent)",
          }}
        >
          <Icon name={localAiBusy ? "loader" : "refresh-cw"} size={18} />
        </div>
      </VersionThumb>
    </div>
  ) : null;

  const versionItems = versionsChrono.map((entry, i) => {
    const active = i === newestIndex;
    return (
      <VersionThumb
        key={`${entry.at}-${i}`}
        slide={entry.slide}
        slideIndex={slideIndex}
        total={slidesLen}
        preset={preset}
        active={active}
        disabled={busy || publicView}
        title={`Версия v${i + 1}`}
        versionLabel={`v${i + 1}`}
        onClick={() => {
          if (!publicView && !active && !busy && onActivate) onActivate(i);
        }}
        onContextMenu={(event) => openVersionContextMenu(event, i)}
      />
    );
  });

  const strip = (
    <div
      style={{
        display: "flex",
        flexDirection: isBelow ? "row" : "column",
        alignItems: "center",
        justifyContent: isBelow ? "center" : undefined,
        width: isBelow ? "100%" : undefined,
        minWidth: isBelow ? 0 : undefined,
        gap: 8,
        overflowX: isBelow ? "auto" : "hidden",
        overflowY: isBelow ? "hidden" : "auto",
        padding: 0,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {versionItems}
      {aiThumb}
    </div>
  );

  const contextMenuNode = contextMenu ? (
    <div
      role="menu"
      style={{
        position: "fixed",
        left: contextMenu.x,
        top: contextMenu.y,
        transform: "translate(0, calc(-100% - 6px))",
        zIndex: 120,
        minWidth: 170,
        padding: 6,
        borderRadius: 10,
        border: "1px solid var(--line)",
        background: "var(--surface)",
        boxShadow: "0 12px 26px rgba(0,0,0,.16)",
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const index = contextMenu.versionIndex;
          setContextMenu(null);
          onDeleteVersion?.(index);
        }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 8,
          background: "transparent",
          color: "#b91c1c",
          fontSize: 13,
          fontWeight: 700,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <Icon name="trash-2" size={14} stroke={2} />
        Удалить версию
      </button>
    </div>
  ) : null;

  if (isBelow) {
    return (
      <div
        className="slide-version-pillbar"
        style={{
          flexShrink: 0,
          width: "100%",
          marginTop: 0,
          paddingTop: 0,
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            padding: 4,
            borderRadius: 999,
            border: "1px solid var(--line)",
            background: "rgba(255,255,255,.94)",
            boxShadow: "0 2px 8px rgba(15,31,58,.08)",
          }}
        >
          {versionsChrono.map((entry, i) => {
            const active = i === newestIndex;
            return (
              <button
                key={`${entry.at}-${i}`}
                type="button"
                disabled={busy || publicView}
                onClick={() => {
                  if (!publicView && !active && !busy && onActivate) onActivate(i);
                }}
                onContextMenu={(event) => openVersionContextMenu(event, i)}
                title={`Версия v${i + 1}`}
                style={{
                  minWidth: 42,
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 999,
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent-fg)" : "var(--ink-3)",
                  fontSize: 13,
                  fontWeight: 760,
                  lineHeight: 1,
                  cursor: busy || publicView ? "default" : "pointer",
                }}
              >
                v{i + 1}
              </button>
            );
          })}
          {!publicView ? (
            <button
              type="button"
              disabled={busy || localAiBusy}
              onClick={() => {
                if (!busy && !localAiBusy) onPromptAi?.(newestIndex >= 0 ? newestIndex : 0);
              }}
              title="Новый вариант"
              style={{
                minWidth: 36,
                height: 30,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                color: localAiBusy ? "var(--ink-4)" : "var(--ink-3)",
                cursor: busy || localAiBusy ? "not-allowed" : "pointer",
              }}
            >
              <Icon name={localAiBusy ? "loader" : "refresh-cw"} size={15} />
            </button>
          ) : null}
        </div>
        {contextMenuNode}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
        width: 76,
      }}
    >
      {strip}
      {contextMenuNode}
    </div>
  );
}
