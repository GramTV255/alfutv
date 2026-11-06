-- Every token found in a source response, by type (tok, cdntoken, jwt, custom): encrypted JSON [{type,value,exp}]
ALTER TABLE channels ADD COLUMN IF NOT EXISTS tokens_enc TEXT;
