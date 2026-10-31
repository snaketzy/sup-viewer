import type { SupEvent } from '@sup-viewer/shared';

/**
 * events 是 display set 的子集，但数组顺序与时间轴一致（按 PTS 升序）。
 * 因此所有“选中下标”都指 events 数组下标，而不是 display set 下标。
 */
export const EPSILON = 1e-3;

/** 返回覆盖该时间点的事件数组下标；落在空隙或范围外返回 null */
export function findEventIndexAt(events: SupEvent[], time: number): number | null {
  if (events.length === 0) return null;

  let low = 0;
  let high = events.length - 1;
  let candidate = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (events[mid].startSeconds <= time + EPSILON) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (candidate < 0) return null;
  return time < events[candidate].startSeconds - EPSILON ? null : candidate;
}

/** 向后（1）或向前（-1）跳到下一条能显示内容的事件 */
export function stepContentEventIndex(
  events: SupEvent[],
  time: number,
  direction: 1 | -1,
): number | null {
  if (events.length === 0) return null;

  if (direction === 1) {
    for (let i = firstIndexAfter(events, time); i < events.length; i += 1) {
      if (events[i].hasContent) return i;
    }
    return null;
  }

  for (let i = lastIndexBefore(events, time); i >= 0; i -= 1) {
    if (events[i].hasContent) return i;
  }
  return null;
}

/** 第一条开始时间严格大于 time 的事件下标 */
function firstIndexAfter(events: SupEvent[], time: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (events[mid].startSeconds <= time + EPSILON) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** 最后一条开始时间严格小于 time 的事件下标 */
function lastIndexBefore(events: SupEvent[], time: number): number {
  let low = -1;
  let high = events.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (events[mid].startSeconds >= time - EPSILON) high = mid - 1;
    else low = mid;
  }
  return low;
}
