# Test script: backend/test_supabase_connection.py
import os
from pathlib import Path
from dotenv import load_dotenv

# IMPORTANT: Load .env BEFORE importing app modules
# This ensures DATABASE_URL is set before the session module creates the engine
backend_dir = Path(__file__).parent
env_path = backend_dir / ".env"

print(f"📁 Looking for .env at: {env_path}")
if env_path.exists():
    load_dotenv(env_path)
    print(f"✅ Loaded .env file")
else:
    print(f"⚠️  .env file not found at {env_path}")
    # Try loading from current directory as fallback
    load_dotenv()

# NOW import app modules (after .env is loaded)
from app.db.session import SessionLocal
from sqlalchemy import text

# Check what DATABASE_URL is being used
database_url = os.getenv("DATABASE_URL", "NOT SET")
print(f"🔍 DATABASE_URL: {database_url[:50]}..." if len(database_url) > 50 else f"🔍 DATABASE_URL: {database_url}")

# Verify it's a PostgreSQL URL
if not database_url.startswith("postgresql"):
    print("⚠️  WARNING: DATABASE_URL doesn't start with 'postgresql'")
    print("   Make sure your .env file contains:")
    print("   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres")
    print()
else:
    # Extract hostname for DNS test
    try:
        import urllib.parse
        parsed = urllib.parse.urlparse(database_url)
        hostname = parsed.hostname
        print(f"🌐 Testing DNS resolution for: {hostname}")
        
        import socket
        try:
            ip = socket.gethostbyname(hostname)
            print(f"✅ DNS resolved: {hostname} -> {ip}")
        except socket.gaierror as e:
            print(f"❌ DNS resolution failed: {e}")
            print("\n💡 Troubleshooting:")
            print("   1. Check your internet connection")
            print("   2. Verify the hostname in your Supabase dashboard")
            print("   3. Try using the connection pooler URL instead:")
            print("      postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres")
            print("   4. Check if you're behind a VPN/firewall that blocks external connections")
    except Exception as e:
        print(f"⚠️  Could not parse DATABASE_URL: {e}")

db = SessionLocal()
try:
    # Test query - query organizations table from Supabase
    result = db.execute(text("SELECT id, name, domain, created_at FROM public.organizations LIMIT 5"))
    organizations = result.fetchall()
    
    print(f"✅ Connected to Supabase! Found {len(organizations)} organizations")
    
    if organizations:
        print("\nOrganizations:")
        for org in organizations:
            print(f"  - {org.name} (ID: {org.id}, Domain: {org.domain or 'N/A'})")
    else:
        print("  (No organizations found in database)")
        
except Exception as e:
    print(f"❌ Connection error: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()