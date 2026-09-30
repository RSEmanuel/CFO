CREATE OR REPLACE FUNCTION reject_builtin_ingest_profile_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD."origin" = 'BUILTIN' THEN
    RAISE EXCEPTION 'Built-in ingest profiles are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ingest_profiles_builtin_immutable_update"
BEFORE UPDATE ON "ingest_mapping_profiles"
FOR EACH ROW EXECUTE FUNCTION reject_builtin_ingest_profile_mutation();

CREATE TRIGGER "ingest_profiles_builtin_immutable_delete"
BEFORE DELETE ON "ingest_mapping_profiles"
FOR EACH ROW EXECUTE FUNCTION reject_builtin_ingest_profile_mutation();
