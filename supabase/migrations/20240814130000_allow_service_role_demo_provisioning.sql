-- Allow service_role and admin to create time entries for other users
-- This enables controlled demo provisioning without weakening member protections
CREATE OR REPLACE FUNCTION public.prevent_professional_id_manipulation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role can always create entries
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admin can create entries for anyone
  IF auth.uid() IS NOT NULL AND public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Regular members can only create entries for themselves
  IF auth.uid() IS NULL OR NEW.professional_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Cannot create time entry for another user';
  END IF;

  RETURN NEW;
END;
$$;
