import test from 'node:test';
import assert from 'node:assert/strict';
import { planEncodings, SCREEN_UPLOAD_BUDGET } from '../js/space/voice/webrtc/budget.js';
import { enableOpusStereo } from '../js/space/voice/webrtc/sdp.js';

const motion = { maxBitrate: 2_500_000, frameRate: 30 };
const high = { maxBitrate: 4_500_000, frameRate: 60 };
const plan = (peers, extra = {}) => planEncodings({ peers, screenViewers: peers, sharingScreen: false, screenPreset: motion, ...extra });
const cameraUpload = (peers) => peers * plan(peers).camera.maxBitrate;

test('sala pequena mantém a qualidade cheia', () => {
  const p = plan(1);
  assert.equal(p.camera.maxBitrate, 1_200_000);
  assert.equal(p.camera.scaleResolutionDownBy, 1);
  assert.equal(p.screen.maxBitrate, motion.maxBitrate);
  assert.equal(p.screen.maxFramerate, 30);
  assert.equal(p.mic.maxBitrate, 48_000);
});

test('upload da câmera não explode com a sala cheia', () => {
  for (let n = 1; n <= 15; n++) assert.ok(cameraUpload(n) <= 3_000_000, `câmera com ${n} conexões: ${cameraUpload(n)}`);
  assert.ok(plan(9).camera.scaleResolutionDownBy >= 3);
});

test('tela divide um orçamento fixo entre os espectadores', () => {
  for (const n of [1, 3, 5, 9, 14]) {
    const p = plan(n, { sharingScreen: true, screenPreset: high });
    assert.ok(p.screen.maxBitrate * n <= Math.max(SCREEN_UPLOAD_BUDGET, n * 400_000), `tela com ${n}`);
    assert.ok(p.screen.maxBitrate <= high.maxBitrate);
  }
  assert.equal(plan(9, { sharingScreen: true }).screen.maxFramerate, 15);
});

test('transmitindo a tela, a câmera cede banda', () => {
  assert.ok(plan(4, { sharingScreen: true }).camera.maxBitrate < plan(4).camera.maxBitrate);
});

test('microfone sempre tem prioridade sobre o vídeo', () => {
  for (const n of [1, 6, 14]) {
    const p = plan(n);
    assert.equal(p.mic.priority, 'high');
    assert.equal(p.mic.networkPriority, 'high');
    assert.equal(p.camera.priority, 'low');
  }
});

test('SDP: liga DTX e FEC e não duplica parâmetros', () => {
  const sdp = [
    'v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=mid:0', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'a=mid:3', 'a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=1', '',
  ].join('\r\n');
  const out = enableOpusStereo(sdp);
  const lines = out.split('\r\n').filter((l) => l.startsWith('a=fmtp:111'));
  assert.equal(lines.length, 2);
  for (const l of lines) {
    assert.equal(l, 'a=fmtp:111 minptime=10;stereo=1;sprop-stereo=1;maxaveragebitrate=128000;useinbandfec=1;usedtx=1');
  }
  assert.equal(enableOpusStereo(out), out);
});
