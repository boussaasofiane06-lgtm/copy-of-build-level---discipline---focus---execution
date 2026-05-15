import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

console.log('Connecting to database...');
const conn = await mysql.createConnection(dbUrl);

// Check existing tables
const [tables] = await conn.query('SHOW TABLES');
console.log('Existing tables:', tables.map(r => Object.values(r)[0]));

// Create tables if they don't exist
const createStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    open_id VARCHAR(255) UNIQUE,
    name VARCHAR(255),
    email VARCHAR(255),
    avatar VARCHAR(500),
    role ENUM('admin','user') DEFAULT 'user',
    created_at BIGINT,
    updated_at BIGINT,
    stripe_customer_id VARCHAR(255)
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    category VARCHAR(100),
    image_url VARCHAR(500),
    images JSON,
    sizes JSON,
    colors JSON,
    stock INT DEFAULT 0,
    published BOOLEAN DEFAULT false,
    featured BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    stripe_price_id VARCHAR(255),
    printify_id VARCHAR(255),
    created_at BIGINT,
    updated_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS blog_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE,
    content LONGTEXT,
    excerpt TEXT,
    image_url VARCHAR(500),
    published BOOLEAN DEFAULT false,
    author VARCHAR(255),
    tags JSON,
    created_at BIGINT,
    updated_at BIGINT
  ) CHARACTER SET utf8mb4`,
  `CREATE TABLE IF NOT EXISTS digital_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price VARCHAR(50),
    category VARCHAR(100),
    product_type ENUM('pdf','audiobook','video','other') DEFAULT 'pdf',
    image_url VARCHAR(500),
    file_key VARCHAR(500),
    file_url VARCHAR(1000),
    file_name VARCHAR(255),
    audio_url VARCHAR(1000),
    duration VARCHAR(50),
    badge VARCHAR(100),
    published BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS digital_purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT,
    email VARCHAR(255),
    stripe_session_id VARCHAR(255),
    download_token VARCHAR(255) UNIQUE,
    created_at BIGINT,
    expires_at BIGINT,
    downloaded BOOLEAN DEFAULT false
  )`,
  `CREATE TABLE IF NOT EXISTS site_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    key_name VARCHAR(255) UNIQUE,
    value LONGTEXT,
    updated_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS ai_videos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255),
    description TEXT,
    video_url VARCHAR(1000),
    thumbnail_url VARCHAR(500),
    duration VARCHAR(50),
    published BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    views INT DEFAULT 0,
    tags JSON,
    created_at BIGINT,
    updated_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS affiliate_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    description TEXT,
    price VARCHAR(50),
    image_url VARCHAR(500),
    affiliate_url VARCHAR(1000),
    platform VARCHAR(100),
    commission VARCHAR(50),
    published BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at BIGINT,
    updated_at BIGINT,
    category VARCHAR(100),
    badge VARCHAR(100)
  )`,
  `CREATE TABLE IF NOT EXISTS membership_tiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    description TEXT,
    price VARCHAR(50),
    interval_type ENUM('monthly','yearly','lifetime') DEFAULT 'monthly',
    features JSON,
    stripe_price_id VARCHAR(255),
    published BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    badge VARCHAR(100),
    created_at BIGINT,
    updated_at BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS digital_product_translations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT,
    language VARCHAR(10),
    title VARCHAR(255),
    content LONGTEXT,
    audio_url VARCHAR(1000),
    created_at BIGINT,
    updated_at BIGINT
  )`,
];

for (const sql of createStatements) {
  const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
  try {
    await conn.query(sql);
    console.log(`✓ Table ${tableName} ready`);
  } catch (e) {
    console.error(`✗ Error creating ${tableName}:`, e.message);
  }
}

const [tablesAfter] = await conn.query('SHOW TABLES');
console.log('\nAll tables:', tablesAfter.map(r => Object.values(r)[0]));

await conn.end();
console.log('\nDone!');
