-- 001 Part 4: Trigger and get_tenant_context
-- Run after 001_part3_policies.sql

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, tenant_id)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.id
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.get_tenant_context(user_uuid UUID)
RETURNS TABLE (
    user_id UUID,
    tenant_id UUID,
    organization_id UUID,
    role TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.id,
        COALESCE(up.tenant_id, up.id) as tenant_id,
        up.organization_id,
        up.role
    FROM user_profiles up
    WHERE up.id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
