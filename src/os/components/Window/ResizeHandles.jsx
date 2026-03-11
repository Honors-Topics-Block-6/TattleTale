export default function ResizeHandles({ handlers }) {
  return (
    <>
      <div className="xp-resize-handle xp-resize-n" {...handlers.n} />
      <div className="xp-resize-handle xp-resize-s" {...handlers.s} />
      <div className="xp-resize-handle xp-resize-e" {...handlers.e} />
      <div className="xp-resize-handle xp-resize-w" {...handlers.w} />
      <div className="xp-resize-handle xp-resize-ne" {...handlers.ne} />
      <div className="xp-resize-handle xp-resize-nw" {...handlers.nw} />
      <div className="xp-resize-handle xp-resize-se" {...handlers.se} />
      <div className="xp-resize-handle xp-resize-sw" {...handlers.sw} />
    </>
  );
}
