import { formatTimecode } from '@sup-viewer/shared';
import { Pause, Play, Repeat, SkipBack, SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { IconTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { loopToggled, playingToggled, rateChanged } from '@/store/playbackSlice';

const RATES = ['0.25', '0.5', '1', '2', '4'];

interface Props {
  disabled: boolean;
  duration: number;
  onStep: (direction: 1 | -1) => void;
}

export function TransportBar({ disabled, duration, onStep }: Props) {
  const dispatch = useAppDispatch();
  const time = useAppSelector((state) => state.playback.time);
  const playing = useAppSelector((state) => state.playback.playing);
  const rate = useAppSelector((state) => state.playback.rate);
  const loop = useAppSelector((state) => state.playback.loop);

  return (
    <div className="flex items-center gap-4 px-4 pb-3">
      <div className="flex flex-1 items-center gap-1">
        <IconTooltip label="上一条字幕（,）">
          <Button variant="ghost" size="icon" disabled={disabled} onClick={() => onStep(-1)}>
            <SkipBack />
          </Button>
        </IconTooltip>
        <IconTooltip label={playing ? '暂停（空格）' : '播放（空格）'}>
          <Button
            variant="secondary"
            size="icon"
            disabled={disabled}
            onClick={() => dispatch(playingToggled())}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
        </IconTooltip>
        <IconTooltip label="下一条字幕（.）">
          <Button variant="ghost" size="icon" disabled={disabled} onClick={() => onStep(1)}>
            <SkipForward />
          </Button>
        </IconTooltip>
      </div>

      <div className="flex items-baseline gap-2 font-mono text-sm tabular-nums">
        <span className="text-foreground">{formatTimecode(time)}</span>
        <span className="text-muted-foreground">/ {formatTimecode(duration)}</span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        <ToggleGroup
          type="single"
          size="sm"
          value={String(rate)}
          disabled={disabled}
          onValueChange={(value) => value && dispatch(rateChanged(Number(value)))}
        >
          {RATES.map((value) => (
            <ToggleGroupItem key={value} value={value} size="sm">
              {value}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <IconTooltip label="循环播放">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            className={cn(loop && 'bg-accent text-foreground')}
            onClick={() => dispatch(loopToggled())}
          >
            <Repeat />
          </Button>
        </IconTooltip>
      </div>
    </div>
  );
}
