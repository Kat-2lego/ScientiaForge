// server/industries.mjs

// TODO: Expand each industry to 15–20 careers.
// For each career, find ESCO URI via:
// GET http://localhost:5001/api/esco/occupations?q=<role>
// and copy the escoUri from the first matching result.

export const INDUSTRIES = [
  {
    id: "technology",
    label: "Technology & IT",
    careers: [
      // Example (replace/add with real ESCO URIs)

      { title: "Software Developer", escoUri: "http://data.europa.eu/esco/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1" },
      { title: "Web Developer", escoUri: "http://data.europa.eu/esco/occupation/c40a2919-48a9-40ea-b506-1f34f693496d" },
      { title: "Data Analyst", escoUri: "http://data.europa.eu/esco/occupation/d3edb8f8-3a06-47a0-8fb9-9b212c006aa2" },
      { title: "Data Scientist", escoUri: "http://data.europa.eu/esco/occupation/258e46f9-0075-4a2e-adae-1ff0477e0f30" },
      { title: "Database Administrator", escoUri: "http://data.europa.eu/esco/occupation/8c57af09-719c-42b3-be40-6ed4946236cc" },
      { title: "Network Engineer", escoUri: "http://data.europa.eu/esco/occupation/cf2b03cd-feb7-4f47-90f6-ff1ed6016d3d" },      
      { title: "Systems Administrator", escoUri: "http://data.europa.eu/esco/occupation/9e2e6e1e-363b-4e1b-a673-7bc0f7343300" },
      { title: "Business Analyst (IT)", escoUri: "http://data.europa.eu/esco/occupation/fe0fa514-b48d-4a53-9757-a283c0baacf0" },
      { title: "Cybersecurity Analyst", escoUri: "http://data.europa.eu/esco/occupation/0464b062-cea6-4164-b10d-956c61956ae7" },

      //{ title: "Cloud Engineer", escoUri: "http://data.europa.eu/esco/occupation/d3edb8f8-3a06-47a0-8fb9-9b212c006aa2" },    
      //{ title: "DevOps Engineer", escoUri: "http://data.europa.eu/esco/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1" },
      //{ title: "IT Support Specialist", escoUri: "http://data.europa.eu/esco/occupation/c40a2919-48a9-40ea-b506-1f34f693496d" },
      
      { title: "UX Designer", escoUri: "http://data.europa.eu/esco/occupation/96e20037-0a25-4bf6-a25e-808d1605d890" },
      { title: "IT Project Manager", escoUri: "http://data.europa.eu/esco/occupation/8b6388a4-4904-471b-9331-d3b1211f5525" },
      // ... up to 15–20
    ],
  },
  {
    id: "real_estate",
    label: "Real Estate & Property",
    careers: [
      { title: "Real Estate Agent", escoUri: "http://data.europa.eu/esco/occupation/8ec8df02-e9dd-43b7-b416-5846ae0414ab" },
      { title: "Property Manager", escoUri: "http://data.europa.eu/esco/occupation/0f5b4653-50b2-413a-826d-39d447480c21" },
      { title: "Real Estate Appraiser", escoUri: "http://data.europa.eu/esco/occupation/afc5a0f4-42e5-4bfb-910c-2b54b44f99c5" },
      // ...
    ],
  },
  {
    id: "healthcare",
    label: "Healthcare & Social Work",
    careers: [
      { title: "Nurse", escoUri: "http://data.europa.eu/esco/occupation/8d3e8aaa-791b-4c75-a465-f3f827028f50" },
      { title: "General Practitioner", escoUri: "http://data.europa.eu/esco/occupation/71f09c8b-a172-408c-b9e7-32e580e39ff6" },
      { title: "Pharmacist", escoUri: "http://data.europa.eu/esco/occupation/7c132147-428b-4ea3-87e1-70f7abb691ce" },
      // ...
    ],
  },
  {
    id: "education",
    label: "Education & Training",
    careers: [
      { title: "Primary School Teacher", escoUri: "http://data.europa.eu/esco/occupation/03d79393-7b30-4159-945b-01963eddd302" },
      { title: "Secondary School Teacher", escoUri: "http://data.europa.eu/esco/occupation/5efb2c08-ba3a-4659-a2e4-1883f54e77b6" },
      { title: "University Lecturer", escoUri: "http://data.europa.eu/esco/occupation/684fd8d5-9b40-4b02-a680-438f0082d923" },
      // ...
    ],
  },
  {
    id: "finance",
    label: "Finance & Banking",
    careers: [
      { title: "Accountant", escoUri: "http://data.europa.eu/esco/occupation/eda0d957-3c3c-4139-b89a-a18bc9e18897" },
      { title: "Financial Analyst", escoUri: "http://data.europa.eu/esco/occupation/8d586ee9-0ab1-4155-a3b0-2ca786c8e48c" },
      { title: "Bank Teller", escoUri: "http://data.europa.eu/esco/occupation/2ff9e53c-6e7f-42af-8d71-b5dd7f283089" },
      // ...
    ],
  },
  {
    id: "retail",
    label: "Retail & Customer Service",
    careers: [
      { title: "Retail Salesperson", escoUri: "http://data.europa.eu/esco/occupation/bf89925d-00a1-4f94-ab3b-2148c887af33" },
      { title: "Customer Service Representative", escoUri: "http://data.europa.eu/esco/occupation/13d1b2b4-99dd-44da-9734-c9f74bae18f7" },
      { title: "Store Manager", escoUri: "http://data.europa.eu/esco/occupation/9e81adde-9983-44fa-b74b-c548d0dbfbdd" },
      // ...
    ],
  },
  {
    id: "engineering",
    label: "Engineering & Manufacturing",
    careers: [
      { title: "Civil Engineer", escoUri: "http://data.europa.eu/esco/occupation/d7d986e1-7333-431b-9719-0c5c6939e360" },
      { title: "Mechanical Engineer", escoUri: "http://data.europa.eu/esco/occupation/579254cf-6d69-4889-9000-9c79dc568644" },
      { title: "Electrical Engineer", escoUri: "http://data.europa.eu/esco/occupation/86ca306c-ab99-420a-9e2a-aa73c5c4de22" },
      // ...
    ],
  },
  {
    id: "construction",
    label: "Construction & Trades",
    careers: [
      { title: "Building Construction Worker", escoUri: "http://data.europa.eu/esco/occupation/fb7e2f4f-1545-42f1-972e-94082e49c6dc" },
      { title: "Domestic Electrician", escoUri: "http://data.europa.eu/esco/occupation/5dbb9cf0-b226-402c-a295-2f42ef05ff8b" },
      { title: "Plumber", escoUri: "http://data.europa.eu/esco/occupation/ed3cf43d-c2c1-4c46-82fc-1375e27e0290" },
      // ...
    ],
  },
  {
    id: "agriculture",
    label: "Agriculture & Farming",
    careers: [
      { title: "Farm Manager", escoUri: "http://data.europa.eu/esco/occupation/4552095e-3396-4831-86ad-4fc34ec39a19" },
      { title: "Agricultural Engineer", escoUri: "http://data.europa.eu/esco/occupation/4d5bd738-9202-4fd7-bd8c-7dbe914048de" },
      { title: "General Veterinarian", escoUri: "http://data.europa.eu/esco/occupation/eb6efbb9-9216-4e86-bc3b-de2223cd4667" },
      // ...
    ],
  },
  {
    id: "hospitality",
    label: "Hospitality & Tourism",
    careers: [
      { title: "Hotel Manager", escoUri: "http://data.europa.eu/esco/occupation/53cdd34e-22f2-41bd-b3c7-de22bf9bbcae" },
      { title: "Chef", escoUri: "http://data.europa.eu/esco/occupation/90f75f67-495d-49fa-ab57-2f320e251d7e" },
      { title: "Tour Guide", escoUri: "http://data.europa.eu/esco/occupation/b476f45f-2c79-44d5-a4d7-fa357aa83074" },
      // ...
    ],
  },
  {
    id: "media_marketing",
    label: "Media, Marketing & Communications",
    careers: [
      { title: "Marketing Specialist", escoUri: "http://data.europa.eu/esco/occupation/4791e217-d607-40d5-9f84-df1d0a071cbc" },
      { title: "Journalist", escoUri: "http://data.europa.eu/esco/occupation/a47f82d3-4cf7-4abf-bb36-2c8cbad28234" },
      { title: "Public Relations Officer", escoUri: "http://data.europa.eu/esco/occupation/c0489e22-6a1b-4e52-974a-eb71bbb42134" },
      // ...
    ],
  },
  {
    id: "legal",
    label: "Legal & Compliance",
    careers: [
      { title: "Lawyer", escoUri: "http://data.europa.eu/esco/occupation/974d4eab-fbee-4c52-b16e-73bdd8c25b53" },
      { title: "Human Rights Officer", escoUri: "http://data.europa.eu/esco/occupation/8801ef16-92a4-4889-8f80-9b78206c7ec0" },
      { title: "Tax Compliance Officer", escoUri: "http://data.europa.eu/esco/occupation/4a39fddb-17e7-4431-be03-613edab8d1c8" },
      // ...
    ],
  },
  {
    id: "transport",
    label: "Transport & Logistics",
    careers: [
      { title: "Cargo Vehicle Driver", escoUri: "http://data.europa.eu/esco/occupation/45037d43-a8f5-4f46-b332-b2935bc305f4" },
      { title: "Logistics and Distribution Manager", escoUri: "http://data.europa.eu/esco/occupation/823db06f-25e1-4658-b063-d6ef956b41f5" },
      { title: "Warehouse Manager", escoUri: "http://data.europa.eu/esco/occupation/2f5de1ab-eddf-4715-8193-e994912c22ea" },
      { title: "Forklift Operator", escoUri: "http://data.europa.eu/esco/occupation/eeac6251-1974-42f5-91ed-513c6c883755" },

      // ...
    ],
  },
  {
    id: "public_sector",
    label: "Public Sector & Administration",
    careers: [
      { title: "Administrative Officer", escoUri: "http://data.europa.eu/esco/occupation/1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p" },
      { title: "Policy Officer", escoUri: "http://data.europa.eu/esco/occupation/caf7b8fb-b2d6-46b7-bffa-bea7f8e4aed8" },
      { title: "Social Worker", escoUri: "http://data.europa.eu/esco/occupation/4b05bef2-ded4-4b09-ab94-f4c6a555a775" },
      // ...
    ],
  },
  {
    id: "creative_arts",
    label: "Creative Arts & Design",
    careers: [
      { title: "Graphic Designer", escoUri: "http://data.europa.eu/esco/occupation/69bcbb0a-8d80-4ecd-b0a4-9adea2a40de2" },
      { title: "Costume Designer", escoUri: "http://data.europa.eu/esco/occupation/d1b1dfdf-7d60-430a-b569-7dd71b2ebeaa" },
      { title: "Video Editor", escoUri: "http://data.europa.eu/esco/occupation/ac734172-ae9a-41ab-80a0-a7b33694e027" },
      { title: "Photographer", escoUri: "http://data.europa.eu/esco/occupation/66542dd6-05a6-4d9e-97ff-3f4858c31ff9" },

      // ...
    ],
  },
];