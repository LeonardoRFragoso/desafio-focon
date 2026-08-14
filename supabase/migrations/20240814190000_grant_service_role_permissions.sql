-- Grant service_role direct permissions
GRANT ALL ON TABLE profiles TO service_role;
GRANT ALL ON TABLE projects TO service_role;
GRANT ALL ON TABLE project_financials TO service_role;
GRANT ALL ON TABLE hourly_rates TO service_role;
GRANT ALL ON TABLE time_entries TO service_role;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
