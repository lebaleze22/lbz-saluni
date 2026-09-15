ALTER TABLE clients
 ADD COLUMN city TEXT,
 ADD COLUMN neighbourhood TEXT,
 ADD COLUMN address_details TEXT,
 ADD COLUMN discovery_source TEXT NOT NULL DEFAULT 'unknown',
 ADD COLUMN discovery_details TEXT,
 ADD COLUMN referred_by_client_id UUID,
 ADD COLUMN referrer_name TEXT,
 ADD CONSTRAINT clients_discovery_source_check CHECK(discovery_source IN ('unknown','recommendation','search','social_media','walk_by','advertisement','other')),
 ADD CONSTRAINT clients_referrer_self_check CHECK(referred_by_client_id IS NULL OR referred_by_client_id <> id),
 ADD CONSTRAINT clients_referrer_source_check CHECK((referred_by_client_id IS NULL AND referrer_name IS NULL) OR discovery_source = 'recommendation'),
 ADD CONSTRAINT clients_referrer_choice_check CHECK(referred_by_client_id IS NULL OR referrer_name IS NULL),
 ADD CONSTRAINT clients_referrer_fk FOREIGN KEY(tenant_id, referred_by_client_id) REFERENCES clients(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE;
