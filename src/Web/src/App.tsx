import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleX,
  CornerDownLeft,
  Maximize2,
  Minimize2,
  Play,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const resolutions = [
  ['320x240', '320 × 240'],
  ['480x360', '480 × 360'],
  ['640x480', '640 × 480'],
  ['800x600', '800 × 600'],
  ['1024x768', '1024 × 768'],
  ['1280x960', '1280 × 960'],
  ['1600x1200', '1600 × 1200'],
  ['1920x1440', '1920 × 1440'],
] as const;

interface ProgressUpdate {
  value: number;
  visible: boolean;
}

function App() {
  const [resolution, setResolution] = useState('640x480');
  const [smoothScaling, setSmoothScaling] = useState(false);
  const [onscreenKeyboardEnabled, setOnscreenKeyboardEnabled] = useState(false);
  const [archiveProgress, setArchiveProgress] = useState<ProgressUpdate>({ value: 0, visible: false });

  useEffect(() => {
    window.dispatchEvent(new Event('nfs-scaling-change'));
  }, [smoothScaling]);

  useEffect(() => {
    window.dispatchEvent(new Event('nfs-onscreen-keyboard-change'));
  }, [onscreenKeyboardEnabled]);

  useEffect(() => {
    const handleProgress = (event: Event) => {
      setArchiveProgress((event as CustomEvent<ProgressUpdate>).detail);
    };
    window.addEventListener('nfs-archive-progress', handleProgress);
    return () => window.removeEventListener('nfs-archive-progress', handleProgress);
  }, []);

  return (
    <>
      <canvas id="display" aria-hidden="true" />
      <canvas id="canvas" tabIndex={-1} aria-label="Need For Speed II SE game canvas" />

      <Button
        id="fullscreen"
        className="fullscreen-control fixed right-1.5 top-1.5 z-50 bg-background/50 backdrop-blur-sm hover:bg-background/70 sm:right-2 sm:top-2"
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label="Enter full screen"
        title="Enter full screen"
      >
        <Maximize2 id="fullscreen-enter-icon" aria-hidden="true" />
        <Minimize2 id="fullscreen-exit-icon" className="hidden" aria-hidden="true" />
      </Button>

      <section id="setup" className="fixed inset-0 z-30 grid place-items-end overflow-y-auto bg-background p-5 sm:p-8" aria-labelledby="setup-title">
        <div className="w-full max-w-md p-5 text-foreground sm:p-6">
          <input id="archive-input" type="file" accept=".zip,application/zip" hidden />

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="resolution">Resolution</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger id="resolution" className="w-full" data-value={resolution}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {resolutions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 py-1.5">
              <Checkbox
                id="scaling"
                checked={smoothScaling}
                data-value={smoothScaling ? 'interpolation' : 'nearest'}
                onCheckedChange={(checked) => setSmoothScaling(checked === true)}
              />
              <Label className="cursor-pointer" htmlFor="scaling">Smooth upscaling</Label>
            </div>
          </div>

          <div className="my-5 flex items-center gap-3">
            <Checkbox
              id="onscreen-keyboard-enabled"
              checked={onscreenKeyboardEnabled}
              onCheckedChange={(checked) => setOnscreenKeyboardEnabled(checked === true)}
            />
            <Label className="cursor-pointer" htmlFor="onscreen-keyboard-enabled">On-screen controls</Label>
          </div>

          <h1 id="setup-title" className="text-sm font-medium">Game data</h1>
          <p className="mb-3 mt-1 text-xs leading-5 text-muted-foreground">
            Select a ZIP with game data (fedata and gamedata).
          </p>

          <div className="grid gap-2">
            <Button id="choose-archive" type="button" variant="outline">
              <Upload data-icon="inline-start" />
              Open from computer
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <p id="archive-detail" className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground empty:hidden" />
            <Button id="replace-archive" type="button" variant="outline" size="sm" hidden>
              <Upload data-icon="inline-start" />
              Replace
            </Button>
          </div>
          <Progress className="mt-4" value={archiveProgress.value * 100} hidden={!archiveProgress.visible} />
          <p id="setup-error" className="mt-4 text-xs leading-5 text-destructive empty:hidden" role="alert" />

          <Button id="start-game" className="mt-5 h-11 w-full text-sm" type="button" size="lg" disabled>
            <Play data-icon="inline-start" />
            Play
          </Button>
        </div>
      </section>

      <section id="onscreen-keyboard" className="onscreen-keyboard fixed inset-0 z-40 select-none" aria-label="On-screen keyboard" hidden>
        <div className="menu-key-layout" aria-label="Menu keys">
          <Button className="virtual-key function-key text-key" type="button" variant="outline" data-code="Escape" aria-label="Escape: pause or go back"><CircleX /><span>Esc</span></Button>
          <Button className="virtual-key text-key enter-key" type="button" variant="outline" data-code="Enter" aria-label="Enter: select"><CornerDownLeft /><span>Enter</span></Button>
        </div>

        <div className="game-key-layout">
          <div className="key-bank key-bank-left" aria-label="Steering keys">
            <Button className="virtual-key" type="button" variant="outline" data-code="ArrowLeft" aria-label="Left: steer left"><ArrowLeft /></Button>
            <Button className="virtual-key" type="button" variant="outline" data-code="ArrowRight" aria-label="Right: steer right"><ArrowRight /></Button>
          </div>

          <div className="key-bank key-bank-right" aria-label="Accelerate and brake keys">
            <Button className="virtual-key" type="button" variant="outline" data-code="ArrowUp" aria-label="Up: accelerate"><ArrowUp /></Button>
            <Button className="virtual-key" type="button" variant="outline" data-code="ArrowDown" aria-label="Down: brake"><ArrowDown /></Button>
          </div>
        </div>
      </section>

      <div id="status" className="fixed left-1/2 top-2.5 z-40 -translate-x-1/2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground empty:hidden" role="status">
        Loading WebAssembly…
      </div>
    </>
  );
}

export default App;
