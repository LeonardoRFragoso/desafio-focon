-- Internal function to get valid hourly rate for a professional on a given date
-- Used by triggers and internal functions, not exposed to API
CREATE OR REPLACE FUNCTION get_hourly_rate_for_date(
  p_professional_id UUID,
  p_date DATE
)
RETURNS NUMERIC AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  SELECT hourly_rate INTO v_rate
  FROM hourly_rates
  WHERE professional_id = p_professional_id
    AND valid_from <= p_date
    AND (valid_until IS NULL OR valid_until >= p_date)
  ORDER BY valid_from DESC
  LIMIT 1;

  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'No valid hourly rate found for professional % on date %', p_professional_id, p_date;
  END IF;

  RETURN v_rate;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function to prevent overlapping hourly rates
CREATE OR REPLACE FUNCTION check_hourly_rate_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM hourly_rates
    WHERE professional_id = NEW.professional_id
      AND id != COALESCE(OLD.id, '00000000-0000-0000-0000-000000000000')
      AND valid_from <= COALESCE(NEW.valid_until, CURRENT_DATE + INTERVAL '100 years')
      AND (valid_until IS NULL OR valid_until >= NEW.valid_from)
  ) THEN
    RAISE EXCEPTION 'Overlapping hourly rate periods for professional %', NEW.professional_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check for overlapping hourly rates
CREATE TRIGGER trg_check_hourly_rate_overlap
BEFORE INSERT OR UPDATE ON hourly_rates
FOR EACH ROW
EXECUTE FUNCTION check_hourly_rate_overlap();

-- Function to apply hourly rate when creating time entry
CREATE OR REPLACE FUNCTION apply_hourly_rate_on_time_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  -- Get the valid hourly rate for the professional on the entry date
  SELECT get_hourly_rate_for_date(NEW.professional_id, NEW.entry_date)
  INTO v_rate;

  NEW.applied_hourly_rate := v_rate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to apply hourly rate on time entry creation
CREATE TRIGGER trg_apply_hourly_rate_on_time_entry
BEFORE INSERT ON time_entries
FOR EACH ROW
EXECUTE FUNCTION apply_hourly_rate_on_time_entry();

-- Function to prevent modification of applied_hourly_rate
CREATE OR REPLACE FUNCTION prevent_hourly_rate_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.applied_hourly_rate IS DISTINCT FROM NEW.applied_hourly_rate THEN
    RAISE EXCEPTION 'Cannot modify applied_hourly_rate after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to prevent modification of applied_hourly_rate
CREATE TRIGGER trg_prevent_hourly_rate_modification
BEFORE UPDATE ON time_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_hourly_rate_modification();

-- Function to prevent user from setting their own professional_id
CREATE OR REPLACE FUNCTION prevent_professional_id_manipulation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.professional_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot create time entry for another user';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to prevent professional_id manipulation
CREATE TRIGGER trg_prevent_professional_id_manipulation
BEFORE INSERT ON time_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_professional_id_manipulation();

-- Function to prevent creating already approved entries
CREATE OR REPLACE FUNCTION prevent_approved_entry_creation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.approval_status != 'pending' THEN
    RAISE EXCEPTION 'New time entries must have pending status';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to prevent creating already approved entries
CREATE TRIGGER trg_prevent_approved_entry_creation
BEFORE INSERT ON time_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_approved_entry_creation();

-- Revoke public access to internal function
REVOKE EXECUTE ON FUNCTION get_hourly_rate_for_date(UUID, DATE) FROM PUBLIC;
