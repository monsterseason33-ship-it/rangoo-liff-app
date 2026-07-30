const SUPABASE_URL = "https://teeporxvxrwzwmnsnjyw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlZXBvcnh2eHJ3endtbnNuanl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDU3NjcxMCwiZXhwIjoyMTAwMTUyNzEwfQ.Bgjp3EEFzRYAolKKb485LaRdShztnKJj3g7EDC8zGkk";

async function testQueries() {
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`
  };

  console.log("=== 1. Test fetch all customer_bindings ===");
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/customer_bindings?select=*&reverted=eq.false&order=created_at.desc&limit=5`, { headers });
    const data = await res.json();
    console.log("Customer bindings count:", data.length);
    console.log("Sample customer_name:", data.map(d => ({ name: d.customer_name, chat_url: d.chat_url })));
  } catch (err) {
    console.error("Query 1 failed:", err);
  }

  console.log("\n=== 2. Test fetch with accounts relation ===");
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/customer_bindings?select=*,account:accounts(*)&reverted=eq.false&order=created_at.desc&limit=5`, { headers });
    const data = await res.json();
    console.log("Result status:", res.status, res.statusText);
    if (!res.ok) console.log("Error body:", data);
    else console.log("Success! Returned count:", data.length);
  } catch (err) {
    console.error("Query 2 failed:", err);
  }
}

testQueries();
