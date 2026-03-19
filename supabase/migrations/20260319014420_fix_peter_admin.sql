-- Fix: Peter Eaton should be admin on Eatons Ranches
UPDATE property_members
SET is_admin = true
WHERE user_id = '264bf299-2e90-47ea-a73c-66e04c765b14'
  AND status = 'approved';
