CREATE UNIQUE INDEX IF NOT EXISTS api_refresh_tokens_family_id_id_idx
  ON api_refresh_tokens(family_id,id);

ALTER TABLE api_refresh_tokens
  ADD COLUMN IF NOT EXISTS rotated_to_token_id uuid;

ALTER TABLE api_refresh_tokens
  ADD CONSTRAINT api_refresh_tokens_rotated_child_family_fk
  FOREIGN KEY (family_id,rotated_to_token_id)
  REFERENCES api_refresh_tokens(family_id,id);

ALTER TABLE api_refresh_tokens
  ADD CONSTRAINT api_refresh_tokens_rotated_child_valid_check
  CHECK (rotated_to_token_id IS NULL OR (rotated_to_token_id<>id AND used_at IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS api_refresh_tokens_rotated_child_idx
  ON api_refresh_tokens(rotated_to_token_id)
  WHERE rotated_to_token_id IS NOT NULL;
