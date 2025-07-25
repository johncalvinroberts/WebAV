import {
  AudioClip,
  ImgClip,
  MP4Clip,
  VisibleSprite,
  renderTxt2ImgBitmap,
} from '@webav/av-cliper';
import {
  Timeline,
  TimelineAction,
  TimelineRow,
  TimelineState,
} from '@xzdarcy/react-timeline-editor';
import { file, write } from 'opfs-tools';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AVCanvas } from '../src';
import './video-editor.css';

type TLActionWithName = TimelineAction & { name: string };

const TimelineEditor = ({
  timelineData: tlData,
  onPreviewTime,
  onOffsetChange,
  onDurationChange,
  onDeleteAction,
  timelineState,
  onSplitAction,
}: {
  timelineData: TimelineRow[];
  timelineState: React.MutableRefObject<TimelineState | undefined>;
  onPreviewTime: (time: number) => void;
  onOffsetChange: (action: TimelineAction) => void;
  onDurationChange: (args: {
    action: TimelineAction;
    start: number;
    end: number;
  }) => void;
  onDeleteAction: (action: TimelineAction) => void;
  onSplitAction: (action: TLActionWithName) => void;
}) => {
  const [scale, setScale] = useState(10);
  const [activeAction, setActiveAction] = useState<TLActionWithName | null>(
    null,
  );
  return (
    <div className="">
      <div>
        <span className="ml-[10px]">缩放：</span>
        <button
          onClick={() => setScale(scale + 5)}
          className="border rounded-full"
        >
          -
        </button>
        <button
          onClick={() => setScale(scale - 5 > 1 ? scale - 5 : 1)}
          className="border rounded-full"
        >
          +
        </button>
        <span className="mx-[10px]">|</span>
        <button
          disabled={activeAction == null}
          className="mx-[10px]"
          onClick={() => {
            if (activeAction == null) return;
            onDeleteAction(activeAction);
          }}
        >
          删除
        </button>
        <button
          disabled={activeAction == null}
          className="mx-[10px]"
          onClick={() => {
            if (activeAction == null) return;
            onSplitAction(activeAction);
          }}
        >
          分割
        </button>
      </div>
      <Timeline
        ref={(v) => {
          if (v == null) return;
          timelineState.current = v;
        }}
        onChange={() => {}}
        style={{ width: '100%', height: '200px' }}
        scale={scale}
        editorData={tlData}
        effects={{}}
        scaleSplitCount={5}
        onClickTimeArea={(time) => {
          onPreviewTime(time);
          return true;
        }}
        onCursorDragEnd={(time) => {
          onPreviewTime(time);
        }}
        onActionResizing={({ dir, action, start, end }) => {
          if (dir === 'left') return false;
          return onDurationChange({ action, start, end });
        }}
        onActionMoveEnd={({ action }) => {
          onOffsetChange(action);
        }}
        onClickAction={(_, { action }) => {
          // @ts-expect-error
          setActiveAction(action);
        }}
        // @ts-expect-error
        getActionRender={(action: TLActionWithName) => {
          const baseStyle =
            'h-full justify-center items-center flex text-white';
          if (action.id === activeAction?.id) {
            return (
              <div
                className={`${baseStyle} border border-red-300 border-solid box-border`}
              >
                {action.name}
              </div>
            );
          }
          return <div className={baseStyle}>{action.name}</div>;
        }}
        autoScroll
      />
    </div>
  );
};

const actionSpriteMap = new WeakMap<TimelineAction, VisibleSprite>();

function App() {
  const [avCvs, setAVCvs] = useState<AVCanvas | null>(null);
  const tlState = useRef<TimelineState>();

  const [playing, setPlaying] = useState(false);
  const [clipSource, setClipSource] = useState('remote');

  const [cvsWrapEl, setCvsWrapEl] = useState<HTMLDivElement | null>(null);
  const [tlData, setTLData] = useState<TimelineRow[]>([
    { id: '1-video', actions: [] },
    { id: '2-audio', actions: [] },
    { id: '3-img', actions: [] },
    { id: '4-text', actions: [] },
  ]);
  const [capture, setCapture] = useState<string | null>(null);

  useEffect(() => {
    if (cvsWrapEl == null) return;
    avCvs?.destroy();
    const cvs = new AVCanvas(cvsWrapEl, {
      bgColor: '#000',
      width: 1280,
      height: 720,
    });
    setAVCvs(cvs);
    cvs.on('timeupdate', (time) => {
      if (tlState.current == null) return;
      tlState.current.setTime(time / 1e6);
    });
    cvs.on('playing', () => {
      setPlaying(true);
    });
    cvs.on('paused', () => {
      setPlaying(false);
    });
    cvs.on('activeSpriteChange', (s: VisibleSprite | null) => {
      console.log('activeSpriteChange:', s);
    });

    // (async () => {
    //   console.log(44444444);
    //   const spr = new VisibleSprite(
    //     new ImgClip(
    //       await renderTxt2ImgBitmap('示例文字', 'font-size: 80px; color: red;'),
    //     ),
    //   );
    //   await cvs.addSprite(spr);
    //   addSprite2Track('4-text', spr, '文字');
    // })();

    // 模拟添加 60个素材，验证内存占用
    (async () => {
      const f = file('/test-1.mp4');
      await write(f, (await fetch('./video/incorrect-frame-type.mp4')).body!);
      for (let i = 0; i < 60; i++) {
        const spr = new VisibleSprite(new MP4Clip(f));
        await spr.ready;
        await cvs.addSprite(spr);
        addSprite2Track('1-video', spr, '视频');
      }
    })();

    return () => {
      cvs.destroy();
    };
  }, [cvsWrapEl]);

  function addSprite2Track(
    trackId: string,
    spr: VisibleSprite,
    name = '',
    autoSetStartTime = true,
  ) {
    const track = tlData.find(({ id }) => id === trackId);
    if (track == null) return null;

    const start =
      autoSetStartTime && spr.time.offset === 0
        ? Math.max(...track.actions.map((a) => a.end), 0) * 1e6
        : spr.time.offset;

    spr.time.offset = start;
    // image
    if (spr.time.duration === Infinity) {
      spr.time.duration = 10e6;
    }

    const action = {
      id: Math.random().toString(),
      start: start / 1e6,
      end: (spr.time.offset + spr.time.duration) / 1e6,
      effectId: '',
      name,
    };

    actionSpriteMap.set(action, spr);

    track.actions.push(action);
    setTLData(
      tlData
        .filter((it) => it !== track)
        .concat({ ...track })
        .sort((a, b) => a.id.charCodeAt(0) - b.id.charCodeAt(0)),
    );
    return action;
  }

  return (
    <div className="canvas-wrap">
      <div ref={(el) => setCvsWrapEl(el)} className="mb-[10px]"></div>
      <input
        type="radio"
        id="clip-source-remote"
        name="clip-source"
        defaultChecked={clipSource === 'remote'}
        onChange={() => {
          setClipSource('remote');
        }}
      />
      <label htmlFor="clip-source-remote"> 示例素材</label>
      <input
        type="radio"
        id="clip-source-local"
        name="clip-source"
        defaultChecked={clipSource === 'local'}
        onChange={() => {
          setClipSource('local');
        }}
      />
      <label htmlFor="clip-source-local"> 本地素材</label>
      <span className="mx-[10px]">|</span>
      <button
        className="mx-[10px]"
        onClick={async () => {
          const stream =
            clipSource === 'local'
              ? (await loadFile({ 'video/*': ['.mp4', '.mov'] })).stream()
              : (await fetch('./video/bunny_0.mp4')).body!;
          const spr = new VisibleSprite(new MP4Clip(stream));
          await avCvs?.addSprite(spr);
          addSprite2Track('1-video', spr, '视频');
        }}
      >
        + 视频
      </button>

      <button
        className="mx-[10px]"
        onClick={async () => {
          const stream =
            clipSource === 'local'
              ? (await loadFile({ 'audio/*': ['.mp3', '.m4a'] })).stream()
              : (await fetch('./audio/16kHz-1chan.mp3')).body!;
          const spr = new VisibleSprite(new AudioClip(stream));
          await avCvs?.addSprite(spr);
          addSprite2Track('2-audio', spr, '音频');
        }}
      >
        + 音频
      </button>
      <button
        className="mx-[10px]"
        onClick={async () => {
          const spr = new VisibleSprite(
            new ImgClip((await fetch('./img/bunny.png')).body!),
          );
          await avCvs?.addSprite(spr);
          addSprite2Track('3-img', spr, '图片');
        }}
      >
        + 图片
      </button>
      <button
        className="mx-[10px]"
        onClick={async () => {
          const spr = new VisibleSprite(
            new ImgClip(
              await renderTxt2ImgBitmap(
                '示例\n文字',
                'font-size: 80px; color: red; text-shadow: 1px 1px 5px #00f; font-family: muyaoruanbi;',
                {
                  font: {
                    name: 'muyaoruanbi',
                    url: './muyaoruanbi.ttf',
                  },
                  onCreated: (el: HTMLElement) => {
                    const bgtxt = el.cloneNode(true) as HTMLElement;
                    bgtxt.style.cssText = `
                        position: absolute;
                        top: 0;
                        left: 0;
                        -webkit-text-stroke: 8px #fff;
                        z-index: -1;
                        margin: 0;
                        font-family: muyaoruanbi;
                      `;
                    el.appendChild(bgtxt);
                  },
                },
              ),
            ),
          );
          await avCvs?.addSprite(spr);
          addSprite2Track('4-text', spr, '文字');
        }}
      >
        + 文字
      </button>
      <span className="mx-[10px]">|</span>
      <button
        className="mx-[10px]"
        onClick={async () => {
          if (avCvs == null || tlState.current == null) return;
          if (playing) {
            avCvs.pause();
          } else {
            avCvs.play({ start: tlState.current.getTime() * 1e6 });
          }
        }}
      >
        {playing ? '暂停' : '播放'}
      </button>
      <button
        className="mx-[10px]"
        onClick={async () => {
          if (avCvs == null) return;
          (await avCvs.createCombinator())
            .output()
            .pipeTo(await createFileWriter('mp4'));
        }}
      >
        导出视频
      </button>
      <button
        className="mx-[10px]"
        onClick={async () => {
          if (avCvs == null) return;
          const b64 = avCvs.captureImage();
          setCapture(b64);
        }}
      >
        截图
      </button>

      <p></p>
      <TimelineEditor
        timelineData={tlData}
        timelineState={tlState}
        onPreviewTime={(time) => {
          avCvs?.previewFrame(time * 1e6);
        }}
        onOffsetChange={(action) => {
          const spr = actionSpriteMap.get(action);
          if (spr == null) return;
          spr.time.offset = action.start * 1e6;
        }}
        onDurationChange={({ action, start, end }) => {
          const spr = actionSpriteMap.get(action);
          if (spr == null) return false;
          const duration = (end - start) * 1e6;
          if (duration > spr.getClip().meta.duration) return false;
          spr.time.duration = duration;
          return true;
        }}
        onDeleteAction={(action) => {
          const spr = actionSpriteMap.get(action);
          if (spr == null) return;
          avCvs?.removeSprite(spr);
          actionSpriteMap.delete(action);
          const track = tlData
            .map((t) => t.actions)
            .find((actions) => actions.includes(action));
          if (track == null) return;
          track.splice(track.indexOf(action), 1);
          setTLData([...tlData]);
        }}
        onSplitAction={async (action: TLActionWithName) => {
          const spr = actionSpriteMap.get(action);
          if (avCvs == null || spr == null || tlState.current == null) return;
          const newClips = await spr
            .getClip()
            .split?.(tlState.current.getTime() * 1e6 - spr.time.offset);
          if (newClips == null) throw Error('split failed');
          // 移除原有对象
          avCvs.removeSprite(spr);
          actionSpriteMap.delete(action);
          const track = tlData.find((t) => t.actions.includes(action));
          if (track == null) return;
          track.actions.splice(track.actions.indexOf(action), 1);
          setTLData([...tlData]);
          // 添加分割后生成的两个新对象
          const sprsDuration = [
            tlState.current.getTime() * 1e6 - spr.time.offset,
            spr.time.duration -
              (tlState.current.getTime() * 1e6 - spr.time.offset),
          ];
          const sprsOffset = [
            spr.time.offset,
            spr.time.offset + sprsDuration[0],
          ];
          for (let i = 0; i < newClips.length; i++) {
            const clip = newClips[i];
            const newSpr = new VisibleSprite(clip);
            if (clip instanceof ImgClip) {
              newSpr.time.duration = sprsDuration[i];
            }
            newSpr.time.offset = sprsOffset[i];
            await avCvs.addSprite(newSpr);
            addSprite2Track(track.id, newSpr, action.name, false);
          }
        }}
      ></TimelineEditor>

      {capture && (
        <CaptureModal capture={capture} onClose={() => setCapture(null)} />
      )}
    </div>
  );
}

// Add this new component after the App component
function CaptureModal({
  capture,
  onClose,
}: {
  capture: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-4 rounded-lg relative max-w-[90vw] max-h-[90vh]">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-black m-0 mb-1 p-0">
            截图预览
          </h2>
          <button
            className="px-2 py-1 bg-red-500 text-white border-none cursor-pointer rounded hover:bg-red-600"
            onClick={onClose}
            title="关闭"
          >
            关闭
          </button>
        </div>
        <img
          src={capture}
          alt="Captured screenshot"
          className="max-w-full max-h-[calc(90vh-80px)]"
        />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('app')!);
root.render(<App />);

async function createFileWriter(
  extName: string,
): Promise<FileSystemWritableFileStream> {
  const fileHandle = await window.showSaveFilePicker({
    suggestedName: `WebAV-export-${Date.now()}.${extName}`,
  });
  return fileHandle.createWritable();
}

async function loadFile(
  accept: Record<MIMEType, FileExtension | FileExtension[]>,
) {
  const [fileHandle] = await window.showOpenFilePicker({
    types: [{ accept }],
  });
  return (await fileHandle.getFile()) as File;
}
