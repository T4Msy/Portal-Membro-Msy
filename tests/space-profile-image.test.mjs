import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesProfileImageSignature, PROFILE_IMAGE_TYPES } from '../js/space/ui/profile-image.js';

const bytes = (...values) => Uint8Array.from(values);

test('aceita os formatos estáticos do perfil', () => {
  assert.deepEqual([...PROFILE_IMAGE_TYPES], ['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  assert.equal(matchesProfileImageSignature('image/jpeg', bytes(0xff, 0xd8, 0xff, 0x00)), true);
  assert.equal(matchesProfileImageSignature('image/png', bytes(137, 80, 78, 71, 13, 10, 26, 10)), true);
  assert.equal(matchesProfileImageSignature('image/webp', bytes(82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80)), true);
});

test('aceita GIF87a e GIF89a e rejeita MIME ou assinatura incompatível', () => {
  assert.equal(matchesProfileImageSignature('image/gif', bytes(71, 73, 70, 56, 55, 97)), true);
  assert.equal(matchesProfileImageSignature('image/gif', bytes(71, 73, 70, 56, 57, 97)), true);
  assert.equal(matchesProfileImageSignature('image/gif', bytes(0, 1, 2, 3, 4, 5)), false);
  assert.equal(matchesProfileImageSignature('image/png', bytes(71, 73, 70, 56, 57, 97)), false);
  assert.equal(matchesProfileImageSignature('image/svg+xml', bytes(60, 115, 118, 103)), false);
});
