import { useCallback, useEffect, useRef, useState } from "react";

// Debounced hover with drag-awareness, shared by the Stage 2 and Stage 3
// tooltips. Behaviour:
//   - A tooltip only shows after the pointer rests on a target for `showDelay`
//     (avoids flicker while the mouse passes over things).
//   - While dragging, any tooltip is hidden immediately.
//   - After dragging ends, tooltips stay suppressed for `dragCooldown`, then
//     reappear if the pointer is still resting on a target.
//
// Returns `activeKey` (the key currently shown, or null) plus `onEnter(key)` /
// `onLeave` handlers to wire onto each hoverable element.
export default function useHoverIntent(
  isDragging,
  { showDelay = 100, dragCooldown = 1000 } = {},
) {
  const [activeKey, setActiveKey] = useState(null);
  const pendingKey = useRef(null); // key under the pointer right now
  const blocked = useRef(false); // true while dragging or cooling down
  const showTimer = useRef(null);
  const cooldownTimer = useRef(null);

  const clearShowTimer = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = null;
  };

  const trySchedule = useCallback(() => {
    clearShowTimer();
    if (blocked.current || pendingKey.current == null) return;
    showTimer.current = setTimeout(
      () => setActiveKey(pendingKey.current),
      showDelay,
    );
  }, [showDelay]);

  const onEnter = useCallback(
    (key) => {
      pendingKey.current = key;
      trySchedule();
    },
    [trySchedule],
  );

  const onLeave = useCallback(() => {
    pendingKey.current = null;
    clearShowTimer();
    setActiveKey(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      blocked.current = true;
      clearShowTimer();
      setActiveKey(null);
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
      cooldownTimer.current = null;
      return;
    }
    // Dragging stopped (or first mount): suppress briefly, then re-enable and
    // re-show whatever the pointer is still resting on.
    cooldownTimer.current = setTimeout(() => {
      blocked.current = false;
      trySchedule();
    }, dragCooldown);
    return () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    };
  }, [isDragging, dragCooldown, trySchedule]);

  useEffect(() => () => clearShowTimer(), []);

  return { activeKey, onEnter, onLeave };
}
