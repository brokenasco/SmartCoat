-- Enables repeatable database tests in the standard non-public extension schema.
create extension if not exists pgtap with schema extensions;
