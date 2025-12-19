-- Upgrade user to Pro and add sample contracts

-- Update user to Pro
UPDATE public.profiles 
SET user_type = 'pro', 
    full_name = 'Pro Test User',
    company_name = 'TestCo Construction'
WHERE user_id = 'f8170b1d-f105-44e8-b32c-f2b637480243';

-- Insert sample contracts
INSERT INTO public.contracts (contractor_id, client_name, client_email, client_phone, project_title, project_description, contract_value, start_date, end_date, status, terms)
VALUES 
  ('f8170b1d-f105-44e8-b32c-f2b637480243', 'Sarah Johnson', 'sarah.j@email.com', '07700 900123', 'Kitchen Renovation', 'Full kitchen refurbishment including new cabinets, worktops, flooring and appliances. Electrical and plumbing updates.', 12500.00, '2024-01-15', '2024-03-01', 'active', 'Payment: 30% upfront, 40% at midpoint, 30% on completion'),
  ('f8170b1d-f105-44e8-b32c-f2b637480243', 'Mike Davis', 'mike.davis@company.co.uk', '07700 900456', 'Bathroom Extension', 'Convert garage space to en-suite bathroom with underfloor heating, walk-in shower and double vanity.', 8750.00, '2024-02-01', '2024-03-15', 'active', 'Payment: 25% deposit, balance on completion'),
  ('f8170b1d-f105-44e8-b32c-f2b637480243', 'Green Living Ltd', 'contracts@greenliving.co.uk', '0207 123 4567', 'Office Refurbishment', 'Commercial office renovation including partitioning, suspended ceilings, LED lighting upgrade and decorating.', 28000.00, '2024-01-08', '2024-04-30', 'active', 'Stage payments as per schedule A'),
  ('f8170b1d-f105-44e8-b32c-f2b637480243', 'James Wilson', 'james.w@email.com', '07700 900789', 'Garage Conversion', 'Convert double garage to home office with insulation, electrics, and heating.', 15000.00, '2023-11-01', '2024-01-10', 'completed', 'Standard T&Cs apply'),
  ('f8170b1d-f105-44e8-b32c-f2b637480243', 'Emma Thompson', 'emma.t@outlook.com', NULL, 'Loft Conversion', 'Dormer loft conversion with two bedrooms and shared bathroom.', 45000.00, '2024-03-01', NULL, 'draft', 'Subject to planning approval');