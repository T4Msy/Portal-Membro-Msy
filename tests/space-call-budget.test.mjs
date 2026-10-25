import test from 'node:test';
import assert from 'node:assert/strict';
import { planEncodings, SCREEN_UPLOAD_BUDGET } from '../js/space/voice/webrtc/budget.js';
import { enableOpusStereo } from '../js/space/voice/webrtc/sdp.js';
import { orderCodecs } from '../js/space/voice/webrtc/codecs.js';

const motion = { maxBitrate: 2_500_000, frameRate: 30, height: 720 };
const high = { maxBitrate: 4_500_000, frameRate: 60, height: 1080 };
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

test('tela reduz resolução e fps conforme os espectadores (menos CPU dos dois lados)', () => {
  const one = plan(1, { sharingScreen: true, screenPreset: high });
  assert.equal(one.screen.scaleResolutionDownBy, 1);
  assert.equal(one.screen.maxFramerate, 60);
  const three = plan(3, { sharingScreen: true, screenPreset: high });
  assert.equal(three.screen.scaleResolutionDownBy, 1);
  assert.equal(three.screen.maxFramerate, 30);
  const five = plan(5, { sharingScreen: true, screenPreset: high });
  assert.equal(five.screen.scaleResolutionDownBy, 1.5); // 1080p -> 720p
  assert.equal(five.screen.maxFramerate, 20);
  const nine = plan(9, { sharingScreen: true, screenPreset: motion });
  assert.equal(nine.screen.scaleResolutionDownBy, 1.33); // 720p -> 540p
  assert.equal(nine.screen.maxFramerate, 15);
  // Usa a altura real da captura (janela pequena não é reduzida à toa).
  assert.equal(plan(9, { sharingScreen: true, screenPreset: high, screenHeight: 500 }).screen.scaleResolutionDownBy, 1);
});

test('codecs: H.264 de hardware primeiro, resto na ordem original', () => {
  const c = (mimeType, sdpFmtpLine = '') => ({ mimeType, sdpFmtpLine });
  const input = [
    c('video/VP8'), c('video/rtx'), c('video/VP9', 'profile-id=0'),
    c('video/H264', 'packetization-mode=0;profile-level-id=42e01f'),
    c('video/H264', 'packetization-mode=1;profile-level-id=4d001f'),
    c('video/H264', 'packetization-mode=1;profile-level-id=42e01f'),
    c('video/H264', 'packetization-mode=1;profile-level-id=42001f'),
  ];
  const out = orderCodecs(input).map((x) => `${x.mimeType} ${x.sdpFmtpLine}`.trim());
  assert.deepEqual(out, [
    'video/H264 packetization-mode=1;profile-level-id=42e01f',
    'video/H264 packetization-mode=1;profile-level-id=42001f',
    'video/H264 packetization-mode=1;profile-level-id=4d001f',
    'video/VP8', 'video/rtx', 'video/VP9 profile-id=0',
    'video/H264 packetization-mode=0;profile-level-id=42e01f',
  ]);
  assert.equal(orderCodecs(input).length, input.length);
});
