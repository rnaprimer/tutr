import 'dotenv/config'
import { deliverNotifications } from '../src/lib/events'
import { pool } from '../src/lib/db'
try {
  console.log('Notifications examined:', await deliverNotifications())
} finally {
  await pool.end()
}
