/* =========================================================================
   Service Categories & Vendor Categories
   ========================================================================= */

// Services organized by group (used in vendor profile selection)
window.SERVICE_CATEGORIES = {
  "Construction & Remodeling": [
    "General Contracting", "Handyman Services", "Carpentry", "Drywall Repair",
    "Framing", "Demolition", "Cabinetry", "Countertop Installation",
    "Tile & Grout Installation", "Concrete Work", "Masonry", "Stucco",
    "Welding"
  ],
  "Plumbing & Electrical": [
    "Plumbing", "Electrical", "Lighting Installation", "Generator Installation",
    "EV Charging Installation", "Solar Panel Installation"
  ],
  "HVAC & Climate Control": [
    "HVAC Installation", "HVAC Repair & Maintenance", "Duct Cleaning",
    "Insulation", "Boiler Services", "Refrigeration"
  ],
  "Exterior & Structural": [
    "Roofing", "Siding", "Gutter Services", "Window Installation/Repair",
    "Door Installation", "Garage Door Services", "Foundation Repair",
    "Waterproofing", "Chimney Sweep"
  ],
  "Finishing & Painting": [
    "Interior Painting", "Exterior Painting", "Wallpaper Services",
    "Flooring — Carpet", "Flooring — Hardwood", "Flooring — Tile",
    "Flooring — Vinyl/LVT", "Refinishing"
  ],
  "Landscaping & Outdoor": [
    "Landscaping", "Lawn Care", "Tree Services", "Irrigation Systems",
    "Hardscaping", "Fencing", "Deck/Patio Construction",
    "Pool & Spa Services", "Snow Removal", "Pressure Washing"
  ],
  "Cleaning & Maintenance": [
    "Janitorial Services", "Carpet Cleaning", "Window Cleaning",
    "Pest Control", "Junk Removal", "Move-In/Move-Out Cleaning",
    "Post-Construction Cleaning"
  ],
  "Specialized & Restoration": [
    "Mold Remediation", "Asbestos Removal", "Lead Abatement",
    "Fire Damage Restoration", "Water Damage Restoration",
    "Smoke Damage Restoration", "Biohazard Cleanup",
    "Locksmith", "Appliance Repair", "Glass & Mirror Services"
  ],
  "Technology & Security": [
    "Security System Installation", "CCTV Installation",
    "Smart Home Installation", "Fire Safety Systems",
    "Access Control Systems", "Low Voltage Wiring"
  ],
  "Other Professional Services": [
    "Septic Services", "Well Services", "Elevator Maintenance",
    "Moving Services", "Property Inspection", "Energy Audits"
  ]
};

// Vendor categories used in the property manager market browser.
// Each category maps to one or more services from SERVICE_CATEGORIES.
window.VENDOR_CATEGORIES = [
  { id: "plumbing",     icon: "🔧", name: "Plumbing",          desc: "Water and drainage system repair and installation.", services: ["Plumbing"] },
  { id: "electrical",   icon: "⚡", name: "Electrical",        desc: "Wiring, panels, lighting and electrical services.", services: ["Electrical","Lighting Installation","Generator Installation"] },
  { id: "hvac",         icon: "❄️", name: "HVAC",              desc: "Heating, ventilation and air conditioning.", services: ["HVAC Installation","HVAC Repair & Maintenance","Duct Cleaning"] },
  { id: "general",      icon: "🏗️", name: "General Contracting", desc: "Full-scope construction and remodeling projects.", services: ["General Contracting","Framing","Demolition"] },
  { id: "handyman",     icon: "🔨", name: "Handyman",          desc: "Multi-purpose repairs and general maintenance.", services: ["Handyman Services"] },
  { id: "roofing",      icon: "🏠", name: "Roofing",           desc: "Roof installation, repair and maintenance.", services: ["Roofing"] },
  { id: "painting",     icon: "🎨", name: "Painting",          desc: "Interior and exterior painting services.", services: ["Interior Painting","Exterior Painting","Wallpaper Services"] },
  { id: "flooring",     icon: "🟫", name: "Flooring",          desc: "Hardwood, tile, vinyl and carpet installation.", services: ["Flooring — Carpet","Flooring — Hardwood","Flooring — Tile","Flooring — Vinyl/LVT"] },
  { id: "landscaping",  icon: "🌳", name: "Landscaping",       desc: "Yard design, installation and maintenance.", services: ["Landscaping","Lawn Care","Tree Services","Irrigation Systems","Hardscaping"] },
  { id: "cleaning",     icon: "🧽", name: "Cleaning",          desc: "Professional cleaning and janitorial services.", services: ["Janitorial Services","Carpet Cleaning","Window Cleaning"] },
  { id: "pest",         icon: "🐜", name: "Pest Control",      desc: "Pest extermination and prevention.", services: ["Pest Control"] },
  { id: "pool",         icon: "🏊", name: "Pool & Spa",        desc: "Pool installation, cleaning and maintenance.", services: ["Pool & Spa Services"] },
  { id: "appliance",    icon: "🔌", name: "Appliance Repair",  desc: "Repair of household and commercial appliances.", services: ["Appliance Repair"] },
  { id: "locksmith",    icon: "🔑", name: "Locksmith",         desc: "Lock services, access control and key services.", services: ["Locksmith"] },
  { id: "garage",       icon: "🚪", name: "Garage Doors",      desc: "Garage door installation and repair.", services: ["Garage Door Services"] },
  { id: "windows",      icon: "🪟", name: "Windows & Doors",   desc: "Window, door and glass installation.", services: ["Window Installation/Repair","Door Installation","Glass & Mirror Services"] },
  { id: "restoration",  icon: "💧", name: "Restoration",       desc: "Water, fire, and smoke damage restoration.", services: ["Mold Remediation","Fire Damage Restoration","Water Damage Restoration","Smoke Damage Restoration"] },
  { id: "security",     icon: "🛡️", name: "Security Systems",  desc: "Security, CCTV and access control systems.", services: ["Security System Installation","CCTV Installation","Access Control Systems"] },
  { id: "smart",        icon: "📱", name: "Smart Home",        desc: "Home automation and smart device installation.", services: ["Smart Home Installation","Low Voltage Wiring"] },
  { id: "junk",         icon: "🗑️", name: "Junk Removal",      desc: "Debris and waste removal services.", services: ["Junk Removal"] },
  { id: "snow",         icon: "❄️", name: "Snow Removal",      desc: "Snow plowing and winter maintenance.", services: ["Snow Removal"] },
  { id: "pressure",     icon: "💦", name: "Pressure Washing",  desc: "Power washing for exteriors and surfaces.", services: ["Pressure Washing"] },
  { id: "fencing",      icon: "🚧", name: "Fencing",           desc: "Fence installation and repair.", services: ["Fencing"] },
  { id: "masonry",      icon: "🧱", name: "Masonry & Concrete",desc: "Concrete, brick, stone and stucco work.", services: ["Concrete Work","Masonry","Stucco"] },
  { id: "chimney",      icon: "🏘️", name: "Chimney Services",  desc: "Chimney cleaning, inspection and repair.", services: ["Chimney Sweep"] },
  { id: "solar",        icon: "☀️", name: "Solar & Energy",    desc: "Solar, EV charging and energy efficiency.", services: ["Solar Panel Installation","EV Charging Installation","Energy Audits"] },
  { id: "foundation",   icon: "🏛️", name: "Foundation Repair", desc: "Foundation repair and waterproofing.", services: ["Foundation Repair","Waterproofing"] },
  { id: "moving",       icon: "📦", name: "Moving Services",   desc: "Residential and commercial moving.", services: ["Moving Services"] },
  { id: "septic",       icon: "🚰", name: "Septic & Well",     desc: "Septic systems and well water services.", services: ["Septic Services","Well Services"] },
  { id: "insulation",   icon: "🧊", name: "Insulation",        desc: "Thermal and acoustic insulation.", services: ["Insulation"] }
];
