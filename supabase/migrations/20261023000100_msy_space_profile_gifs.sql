-- Permite GIFs animados nos perfis do MSY Space sem alterar as policies atuais.
-- O limite continua em 8 MiB, alinhado ao maior limite de upload da interface.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    file_size_limit = 8388608
where id = 'space-profile-media';
