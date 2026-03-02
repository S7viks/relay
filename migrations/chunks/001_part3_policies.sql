-- 001 Part 3: RLS policies
-- Run after 001_part2_indexes_rls.sql

CREATE POLICY "Users can view own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can view own organization"
    ON organizations FOR SELECT
    USING (
        id IN (
            SELECT organization_id FROM user_profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can view own tenant queries"
    ON api_queries FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own tenant queries"
    ON api_queries FOR INSERT
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
        )
    );
