import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAdminRole() {
  console.log('Fixing admin role for zukicreative66@gmail.com...');
  
  // Update the role to admin
  const { data, error } = await supabase
    .from('users')
    .update({ role: 'admin' })
    .eq('email', 'zukicreative66@gmail.com')
    .select();
  
  if (error) {
    console.error('Error updating role:', error);
  } else {
    console.log('✅ Success! User role updated to admin:', data);
  }
  
  process.exit(0);
}

fixAdminRole();
