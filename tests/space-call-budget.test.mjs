import test from 'node:test';
import assert from 'node:assert/strict';
import { planEncodings, SCREEN_UPLOAD_BUDGET } from '../js/space/voice/webrtc/budget.js';
import { enableOpusStereo } from '../js/space/voice/webrtc/sdp.js';
import { orderCodecs } from '../js/space/voice/webrtc/codecs.js';
import { MAX_SCREEN_LEVEL, ScreenQualityController, screenHealth, screenLevelEncoding } from '../js/space/voice/webrtc/screenQuality.js';

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

test('tela não reduz resolução nem fps de todo mundo pelo número de espectadores', () => {
  for (const n of [1, 5, 9]) {
    const p = plan(n, { sharingScreen: true, screenPreset: high });
    assert.equal(p.screen.scaleResolutionDownBy, 1);
    assert.equal(p.screen.maxFramerate, 60);
  }
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

const stat = (o = {}) => ({ framesReceived: 0, framesDecoded: 0, framesDropped: 0, totalDecodeTime: 0, totalFreezesDuration: 0, ...o });

test('saúde da tela: detecta descarte, decodificação lenta e congelamento', () => {
  const a = stat();
  assert.equal(screenHealth(null, a), null);
  assert.equal(screenHealth(a, stat({ framesReceived: 4, framesDecoded: 4 })), null); // tela parada: sem amostra
  assert.equal(screenHealth(a, stat({ framesReceived: 60, framesDecoded: 60, totalDecodeTime: 0.3 })).bad, false); // 5 ms/quadro
  assert.deepEqual(screenHealth(a, stat({ framesReceived: 60, framesDecoded: 40, framesDropped: 20, totalDecodeTime: 0.2 })).reasons, ['descartando quadros']);
  assert.deepEqual(screenHealth(a, stat({ framesReceived: 40, framesDecoded: 40, totalDecodeTime: 2 })).reasons, ['decodificação lenta']);
  assert.deepEqual(screenHealth(a, stat({ framesReceived: 40, framesDecoded: 40, totalFreezesDuration: 1 })).reasons, ['congelando']);
});

test('controle: desce rápido, sobe devagar e não oscila', () => {
  const q = new ScreenQualityController();
  const bad = { bad: true }, good = { bad: false };
  assert.equal(q.sample(bad), null);
  assert.equal(q.sample(bad), 1); // 2 amostras ruins (4 s)
  assert.equal(q.sample(bad), null); // espera o encoder se ajustar
  assert.equal(q.sample(bad), null);
  assert.equal(q.sample(bad), null);
  assert.equal(q.sample(bad), 2);
  assert.equal(q.sample(null), null); // sem dados não muda
  assert.equal(q.level, 2);
  let steps = 0, out = null;
  while (out === null && steps < 200) { out = q.sample(good); steps++; }
  assert.equal(out, 1);
  assert.ok(steps >= 15, `subiu cedo demais (${steps} amostras)`); // pelo menos 30 s bons
  assert.ok(steps <= 20, `demorou para subir (${steps} amostras)`); // ~30 s mesmo depois de 2 descidas
  // Piorou logo depois de subir: a próxima subida espera mais.
  q.sample(bad); q.sample(bad); q.sample(bad); q.sample(bad); // hold + 2 ruins
  assert.equal(q.level, 2);
  assert.equal(q.upAfter, 30);
  for (let i = 0; i < 50; i++) q.sample(bad);
  assert.equal(q.level, MAX_SCREEN_LEVEL);
});

test('nível reduz só a conexão daquele espectador, sem passar do orçamento', () => {
  const base = { maxBitrate: 1_200_000, maxFramerate: 60, scaleResolutionDownBy: 1, priority: 'medium' };
  assert.equal(screenLevelEncoding(base, 0, 1080), base);
  const l1 = screenLevelEncoding(base, 1, 1080);
  assert.deepEqual([l1.maxBitrate, l1.maxFramerate, l1.scaleResolutionDownBy, l1.priority], [1_200_000, 20, 1.5, 'medium']);
  const l3 = screenLevelEncoding(base, 3, 1080);
  assert.deepEqual([l3.maxBitrate, l3.maxFramerate, l3.scaleResolutionDownBy], [500_000, 10, 3]);
  assert.equal(screenLevelEncoding(base, 1, 500).scaleResolutionDownBy, 1); // captura pequena: não reduz à toa
});
