# Dream Town Surprises — Branch 2

Same booking-management functionality as the original Dream Town Surprises website, with a Rose + Pearl + Champagne visual theme.

## Theme
- Pearl / ivory background
- Dusty rose accents
- Champagne gold details
- Deep plum typography
- Romantic, premium, surprise-event aesthetic

## Important
The included config.js currently points to the original Supabase project so the clone can run immediately.
For an independent branch, create a separate Supabase project and replace the values in config.js, then run the supplied staff_approval.sql and the bookings schema/migrations required by the app.


## Kodungaiyur configuration

This branch is configured for the separate Supabase project:
`https://hywrnhkkhatdprbgujyd.supabase.co`

After uploading these files to GitHub Pages, hard-refresh the site (Ctrl+F5).
The stylesheet includes a cache-busting query in `index.html` so the new CSS is loaded.

Run the Kodungaiyur base schema and staff/policy SQL in the new Supabase SQL Editor before creating the owner account.
