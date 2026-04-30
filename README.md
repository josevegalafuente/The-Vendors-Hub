# The Vendors Hub

A functional static prototype for a vendor registration and property manager marketplace web app.

## What is included

- Role-based registration and login for Vendors and Property Managers.
- Vendor profile creation and editing.
- Vendor profile photo upload using browser storage.
- Vendor service selection across many common U.S. property service categories.
- Editable vendor coverage areas by state, county, and cities.
- Property Manager national markets page with all 50 U.S. states.
- Market pages with service category counts based only on real registered vendors.
- Category pages listing vendors who actually match that state and service.
- Vendor profile pages for Property Managers with contact details, services, coverage, and reviews.
- No fake vendor counts or fake vendor profiles.
- Back buttons for market/category/profile navigation.

## How to run locally

1. Open the folder in Visual Studio Code.
2. Install the **Live Server** extension if you do not already have it.
3. Right-click `index.html` and select **Open with Live Server**.
4. Register as a Vendor or Property Manager.

You can also open `index.html` directly in a browser, but Live Server is recommended.

## Important technical note

This is a front-end prototype. It uses `localStorage`, which means data is stored only in the current browser on the current computer.

For a production version with real authentication, secure passwords, cloud profiles, and shared vendor data, you will need a backend such as:

- Supabase
- Firebase
- Appwrite
- A custom Node.js/Express API
- A traditional backend with PostgreSQL/MySQL

Recommended production features:

- Secure authentication
- Password hashing
- Database storage
- File/image storage
- Admin approval workflow
- Email verification
- Vendor verification badges
- Map integration using Google Maps, Mapbox, or Leaflet
- Real county/city dataset integration
