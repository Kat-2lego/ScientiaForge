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

      { title: "Software Developer", escoUri: "http://data.europa.eu/esco/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1" },
      { title: "Web Developer", escoUri: "http://data.europa.eu/esco/occupation/c40a2919-48a9-40ea-b506-1f34f693496d" },
      { title: "Data Analyst", escoUri: "http://data.europa.eu/esco/occupation/d3edb8f8-3a06-47a0-8fb9-9b212c006aa2" },
      
      { title: "Data Scientist", escoUri: "http://data.europa.eu/esco/occupation/258e46f9-0075-4a2e-adae-1ff0477e0f30" },
      { title: "Database Administrator", escoUri: "http://data.europa.eu/esco/occupation/8c57af09-719c-42b3-be40-6ed4946236cc" },
      { title: "Network Engineer", escoUri: "http://data.europa.eu/esco/occupation/cf2b03cd-feb7-4f47-90f6-ff1ed6016d3d" },      
      
      { title: "Systems Administrator", escoUri: "http://data.europa.eu/esco/occupation/9e2e6e1e-363b-4e1b-a673-7bc0f7343300" },
      { title: "Systems Analyst", escoUri: "http://data.europa.eu/esco/occupation/a6a0b60f-08da-4faa-bf54-942987efb471" },
      { title: "Business Analyst (IT)", escoUri: "http://data.europa.eu/esco/occupation/fe0fa514-b48d-4a53-9757-a283c0baacf0" },
      
      { title: "Cybersecurity Analyst", escoUri: "http://data.europa.eu/esco/occupation/0464b062-cea6-4164-b10d-956c61956ae7" },      
      { title: "UX Designer", escoUri: "http://data.europa.eu/esco/occupation/96e20037-0a25-4bf6-a25e-808d1605d890" },
      { title: "IT Project Manager", escoUri: "http://data.europa.eu/esco/occupation/8b6388a4-4904-471b-9331-d3b1211f5525" },
    ],
  },
  {
    id: "real_estate",
    label: "Real Estate & Property",
    careers: [
      { title: "Real Estate Agent", escoUri: "http://data.europa.eu/esco/occupation/8ec8df02-e9dd-43b7-b416-5846ae0414ab" },
      { title: "Property Manager", escoUri: "http://data.europa.eu/esco/occupation/0f5b4653-50b2-413a-826d-39d447480c21" },
      { title: "Real Estate Appraiser", escoUri: "http://data.europa.eu/esco/occupation/afc5a0f4-42e5-4bfb-910c-2b54b44f99c5" },      
      
      { title: "Leasing Consultant", escoUri: "http://data.europa.eu/esco/occupation/cee31c49-abe9-4f29-ad10-5eefe63f2a57" },
      { title: "Facilities Manager", escoUri: "http://data.europa.eu/esco/occupation/b42c5ed4-c6e4-4694-934f-96127719cc43" },
      { title: "Building Inspector", escoUri: "http://data.europa.eu/esco/occupation/f0e479d9-7afd-40b1-b60f-b68c400c15fb" },
      
      { title: "Real Estate Developer", escoUri: "http://data.europa.eu/esco/occupation/b9711647-463f-4991-a858-d5de66ff2f83" },
      { title: "Real Estate Surveyor", escoUri: "http://data.europa.eu/esco/occupation/bbefa1b2-521e-4d87-a7ad-9bbd0b32e271" },
      { title: "Real Estate Leasing Manager", escoUri: "http://data.europa.eu/esco/occupation/cee31c49-abe9-4f29-ad10-5eefe63f2a57" },

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
      
      { title: "Psychologist", escoUri: "http://data.europa.eu/esco/occupation/52ded7d7-11df-42e3-b90a-d7f4b70fb4b9" },
      { title: "Social Worker", escoUri: "http://data.europa.eu/esco/occupation/4b05bef2-ded4-4b09-ab94-f4c6a555a775" },
      { title: "Paramedic", escoUri: "http://data.europa.eu/esco/occupation/0b5dfc02-b825-4445-811d-d39ed442657e" },
      
      { title: "Dentist", escoUri: "http://data.europa.eu/esco/occupation/e52b5707-7097-4dbc-ac61-054e917da241" },
      { title: "Midwife", escoUri: "http://data.europa.eu/esco/occupation/95cda6a9-a70a-4a93-9442-11d573cb4a02" },
      { title: "Radiographer", escoUri: "http://data.europa.eu/esco/occupation/7639a601-6db0-41ed-9fb0-813d9b8beb05" },
      
      { title: "Dental Hygienist", escoUri: "http://data.europa.eu/esco/occupation/d18deca3-3063-4970-9ddc-e3c70404a28c" },
      { title: "Clinical Psychologist", escoUri: "http://data.europa.eu/esco/occupation/c3c8c56c-b3ab-4425-a38a-abcace020d22" },

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
      
      { title: "Special Needs Educator", escoUri: "http://data.europa.eu/esco/occupation/976cbfcc-8958-4800-a435-71d15405a42a" },
      { title: "Academic Tutor", escoUri: "http://data.europa.eu/esco/occupation/59bce29f-5c8b-47cf-bfd4-6ec003f5323a" },
      { title: "E-Learning Designer", escoUri: "http://data.europa.eu/esco/occupation/ec5b72d1-0206-4179-9abd-570c66bc44b9" },
      
      { title: "Education Administrator", escoUri: "http://data.europa.eu/esco/occupation/55b4faa3-286f-4fc8-ac67-8bbb97d08820" },
      { title: "Curriculum Administrator", escoUri: "http://data.europa.eu/esco/occupation/d89b23c2-d042-4ca6-a917-109fe5a0b30c" },
      { title: "Corporate Trainer", escoUri: "http://data.europa.eu/esco/occupation/0ba06640-e0ac-4911-9e43-289a8e41651e" },
      
      { title: "College Instructor (Vocational)", escoUri: "http://data.europa.eu/esco/occupation/81f8d141-3f67-4fb0-a349-db0147ef7b3a" },
      { title: "Mathematician", escoUri: "http://data.europa.eu/esco/occupation/72628f3a-fd49-499a-9741-870b0a1fcef2" },
      { title: "Sociology Lecturer", escoUri: "http://data.europa.eu/esco/occupation/116b4c55-5bd0-41e9-9227-98d7ecffeaf6" },
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
      
      { title: "Corporate Investment Banker", escoUri: "http://data.europa.eu/esco/occupation/244a79eb-122b-4bee-8065-b4c39efce4ff" },
      { title: "Financial Planner", escoUri: "http://data.europa.eu/esco/occupation/21de0f3b-a71a-4263-a9ba-90c5f3721b4d" },
      
      { title: "Tax Advisor", escoUri: "http://data.europa.eu/esco/occupation/59c22779-4d89-4bc9-ba8b-d64bea236723" },
      { title: "Bookkeeper", escoUri: "http://data.europa.eu/esco/occupation/c3aae59e-1441-4b3e-bdd1-6da50dc7cf42" }, 
      { title: "Insurance Broker", escoUri: "http://data.europa.eu/esco/occupation/a198de8c-24b1-4002-982f-a57ae6d6c19c" },
      
      { title: "Asset Manager", escoUri: "http://data.europa.eu/esco/occupation/e20eee17-4876-4f21-a0cb-5d7f40c63cd8" },
      { title: "Financial Auditor", escoUri: "http://data.europa.eu/esco/occupation/1ad59946-d13e-441e-9b36-56e1df055e21" },
      { title: "Payroll Clerk", escoUri: "http://data.europa.eu/esco/occupation/ade351da-7bda-424e-8682-bbdcab2a25be" },
      { title: "Bank Manager", escoUri: "http://data.europa.eu/esco/occupation/754ce08f-b4d9-4b9c-b9d2-06f15258a3ce" },

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
      
      { title: "Cashier", escoUri: "http://data.europa.eu/esco/occupation/2b871272-bd61-4206-bd1a-0b96d7023098" },
      { title: "retail entrepreneur", escoUri: "http://data.europa.eu/esco/occupation/bf89925d-00a1-4f94-ab3b-2148c887af33" },
      { title: "Call Centre Agent", escoUri: "http://data.europa.eu/esco/occupation/0ededdc2-050a-4ec3-8e70-6295105fcd19" },
      
      { title: "Shop Assistant", escoUri: "http://data.europa.eu/esco/occupation/0b15375e-dfdd-4047-9efb-096e0aaee7d2" },
      { title: "Customer Experience Manager", escoUri: "http://data.europa.eu/esco/occupation/9c9752b7-3e3b-4a08-8553-b63a013f8072" },
      { title: "Sales Manager", escoUri: "http://data.europa.eu/esco/occupation/a7594892-ff23-4e2a-aedf-2f967ebca15c" },
      
      { title: "Department Store Manager", escoUri: "http://data.europa.eu/esco/occupation/7dec82e0-3bfc-4c48-812d-c2095bfe05bb" },
      { title: "Visual Merchandiser", escoUri: "http://data.europa.eu/esco/occupation/35eb0aa6-b40d-449d-9390-719be8912277" },


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

      { title: "Industrial Engineer", escoUri: "http://data.europa.eu/esco/occupation/53d2052f-edc0-4f44-8be1-164526412bfe" },
      { title: "Environmental Engineer", escoUri: "http://data.europa.eu/esco/occupation/ac1fc6a9-70d2-475c-8fa0-82ef83830968" },
      { title: "Chemical Engineer", escoUri: "http://data.europa.eu/esco/occupation/ec21ce88-ce14-49b6-be0a-cc53cf5a3a67" },

      { title: "Automation Engineer", escoUri: "http://data.europa.eu/esco/occupation/bb609566-3ab6-44dd-8f48-cf0b15b96827" },
      { title: "Robotics Engineer", escoUri: "http://data.europa.eu/esco/occupation/551a6797-3ca9-41fc-9dca-9a982a8fd8a6" },
      { title: "Nuclear Engineer", escoUri: "http://data.europa.eu/esco/occupation/f14194e2-8e7f-4fc9-9c8c-78d9ae2e7284" },
      
      { title: "Process Engineer", escoUri: "http://data.europa.eu/esco/occupation/b5eaf231-77ad-4a86-8e54-15cc4398aad2" },
      { title: "Manufacturing Engineer", escoUri: "http://data.europa.eu/esco/occupation/6818c837-072a-4120-b913-bd360b7b14d0" },
      { title: "Maintenance and Repair Engineer", escoUri: "http://data.europa.eu/esco/occupation/615920c5-4f63-4eb3-8b60-afaaed3ab1ff" },
     
      { title: "Quality Engineer", escoUri: "http://data.europa.eu/esco/occupation/30c0943c-caa1-411d-b273-26f475971273" },
      { title: "Industrial Production Manager", escoUri: "http://data.europa.eu/esco/occupation/eb9479c6-5fdf-4f45-ace4-28b547b8c7e5" },

      // ...
    ],
  },
  // {
  //   id: "construction",
  //   label: "Construction & Trades",
  //   careers: [
  //     { title: "Building Construction Worker", escoUri: "http://data.europa.eu/esco/occupation/fb7e2f4f-1545-42f1-972e-94082e49c6dc" },
  //     { title: "Domestic Electrician", escoUri: "http://data.europa.eu/esco/occupation/5dbb9cf0-b226-402c-a295-2f42ef05ff8b" },
  //     { title: "Plumber", escoUri: "http://data.europa.eu/esco/occupation/ed3cf43d-c2c1-4c46-82fc-1375e27e0290" },

  //     //{ title: "Carpenter", escoUri: "http://data.europa.eu/esco/occupation/2a22ff9e-de3b-408d-b312-5034896cc4f4" },
  //     //{ title: "Bricklayer", escoUri: "http://data.europa.eu/esco/occupation/05f321f8-055b-407d-bf19-e0ddabda56b7" },
  //     //{ title: "Welder", escoUri: "http://data.europa.eu/esco/occupation/7aedaa07-3884-4c5b-88f9-80997b2aa54b" },

  //     { title: "Construction Safety Manager", escoUri: "http://data.europa.eu/esco/occupation/3f54ceba-3c4e-4ba1-8ddb-9e49a881a60a" },
  //     { title: "Construction Painter", escoUri: "http://data.europa.eu/esco/occupation/15620506-fb5d-49cd-87a2-1c9047fb406a" },
  //     //{ title: "Roofer", escoUri: "http://data.europa.eu/esco/occupation/b4c6d1b0-929e-48be-9f67-47bd8c30658b" },
      
  //     { title: "Construction Scaffolding Supervisor", escoUri: "http://data.europa.eu/esco/occupation/2ea3070e-3d0b-4de6-b5bd-fe4a04649b04" },
  //     { title: "Construction Equipment Technician", escoUri: "http://data.europa.eu/esco/occupation/b0480558-269d-4903-9bc7-f390cd6a6964" },
  //     { title: "Tile Fitter", escoUri: "http://data.europa.eu/esco/occupation/02447817-ea01-4d8b-b09c-8bc128e447e6" },
 

  //     // ...
  //   ],
  // },
  {
    id: "agriculture",
    label: "Agriculture & Farming",
    careers: [
      { title: "Farm Manager", escoUri: "http://data.europa.eu/esco/occupation/4552095e-3396-4831-86ad-4fc34ec39a19" },
      { title: "Agricultural Engineer", escoUri: "http://data.europa.eu/esco/occupation/4d5bd738-9202-4fd7-bd8c-7dbe914048de" },
      { title: "General Veterinarian", escoUri: "http://data.europa.eu/esco/occupation/eb6efbb9-9216-4e86-bc3b-de2223cd4667" },
      
      { title: "Agricultural Technician", escoUri: "http://data.europa.eu/esco/occupation/1f8314c2-01bd-4af4-babc-04d7034591b8" },
      { title: "Agronomist", escoUri: "http://data.europa.eu/esco/occupation/c40ef517-d4ab-4932-b184-9c2ea5b24fe2" },
      { title: "Horticulture Production Manager", escoUri: "http://data.europa.eu/esco/occupation/d36b66f8-c08a-4416-953b-62c271ca7509" },
     
      { title: "Mixed Farmer", escoUri: "http://data.europa.eu/esco/occupation/1c1e86f9-6347-42d6-aa6e-c95b138bf640" },
      { title: "Agricultural Inspector", escoUri: "http://data.europa.eu/esco/occupation/715b902f-b1b6-4366-afc6-ddb8ab715229" },
      { title: "Forestry Technician", escoUri: "http://data.europa.eu/esco/occupation/fbf3aefb-70ff-440b-8724-bac3ed5e2c93" },
      
      { title: "Pest Management Worker", escoUri: "http://data.europa.eu/esco/occupation/21cba86a-68c5-456c-aec2-cc04840b3c0e" },
      { title: "Irrigation Technician", escoUri: "http://data.europa.eu/esco/occupation/534d18fe-eae4-4a02-af4d-f78e92faa5d5" },
      { title: "Animal Feed Nutritionist", escoUri: "http://data.europa.eu/esco/occupation/e97ce81a-cf24-4012-b39e-f87bedc5b450" },
      { title: "Agricultural Machinery Technician", escoUri: "http://data.europa.eu/esco/occupation/f7145f87-5940-43f5-bc98-aa1a2b872b47" },

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

      //{ title: "Bartender", escoUri: "http://data.europa.eu/esco/occupation/2f5e38a0-6578-4665-bdbd-e2ab505be140" },
      { title: "Housekeeping Supervisor", escoUri: "http://data.europa.eu/esco/occupation/fae51298-03a8-4df4-829a-685dddc1580e" },
      { title: "Travel Agent", escoUri: "http://data.europa.eu/esco/occupation/79f8f68c-5509-4119-9373-8bef1c364d31" },
     
      { title: "Event Manager", escoUri: "http://data.europa.eu/esco/occupation/1b38a27d-ef98-4d9f-b1b2-8c109bf47e79" },
      { title: "Restaurant Manager", escoUri: "http://data.europa.eu/esco/occupation/d5eb6150-bbff-4a9c-9d0c-21eab4dbe2b6" },
      { title: "Hospitality Establishment Receptionist", escoUri: "http://data.europa.eu/esco/occupation/82025c02-9082-416c-998b-f51eb0359ee6" },
      
      { title: "Tour Organiser", escoUri: "http://data.europa.eu/esco/occupation/5b9a678a-7c35-4c50-a804-754b82652ee6" },
      //{ title: "Sommelier", escoUri: "http://data.europa.eu/esco/occupation/499f80e3-860c-48ef-8286-be929a93e254" },
     // { title: "Waiter/Waitress", escoUri: "http://data.europa.eu/esco/occupation/d5db9d5c-2ebf-4a54-a79a-1b7e7ff70471" },

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

      { title: "Advertising Manager", escoUri: "http://data.europa.eu/esco/occupation/4ebf2dae-c326-4627-befe-fbc91410f432" },
      { title: "Brand Manager", escoUri: "http://data.europa.eu/esco/occupation/de80bbf0-447d-4a6a-845a-fdba4e0dc30c" },
      { title: "Presenter", escoUri: "http://data.europa.eu/esco/occupation/09a9a956-db70-436f-8398-d85a17f6cdfe" },
      
      { title: "Advertising Media Planner", escoUri: "http://data.europa.eu/esco/occupation/b55718eb-e8ff-4485-8ad0-bbac32cbd77b" },
      { title: "Broadcast News Editor", escoUri: "http://data.europa.eu/esco/occupation/b65530b8-0b50-49da-8e9e-331b161374a5" },
      { title: "News Anchor", escoUri: "http://data.europa.eu/esco/occupation/83e45d86-1bce-45c5-ba8b-097738f9f28b" },
      
      { title: "Communication Manager", escoUri: "http://data.europa.eu/esco/occupation/cd7b838c-51f6-41ec-9067-bb974c0f991b" },
      { title: "Advertising Photographer", escoUri: "http://data.europa.eu/esco/occupation/b1ab3572-fa2f-4624-8eac-3c3d986d237b" },
      { title: "Copywriter", escoUri: "http://data.europa.eu/esco/occupation/a47f82d3-4cf7-4abf-bb36-2c8cbad28234" },

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

      { title: "Judge", escoUri: "http://data.europa.eu/esco/occupation/07bd65d7-c13f-443a-bdf6-88903f3822be" },
      { title: "Corporate Lawyer", escoUri: "http://data.europa.eu/esco/occupation/fdfce14e-992d-4ff4-9f9d-7a353c75654e" },
      { title: "Conveyance Clerk", escoUri: "http://data.europa.eu/esco/occupation/a9411821-4f54-406e-ba37-4c6e5a39f9fe" },

      { title: "Prosecutor", escoUri: "http://data.europa.eu/esco/occupation/acf462a3-9c34-46cb-952a-c612c38299f4" },
      { title: "Legal Policy Officer", escoUri: "http://data.europa.eu/esco/occupation/5d601b40-7e0e-404e-bbff-bb98e147437c" },
      { title: "Regulatory Affairs Manager", escoUri: "http://data.europa.eu/esco/occupation/779d13be-60b4-48f3-a339-fe483be96c7f" },

      { title: "Court Jury Coordinator", escoUri: "http://data.europa.eu/esco/occupation/76884a72-d8b8-4819-bd40-71d6420a9a42" },
      { title: "Notary Public", escoUri: "http://data.europa.eu/esco/occupation/d21890a3-cbe9-49df-9a19-a4120d866548" },

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
      { title: "Freight Transport Dispatcher", escoUri: "http://data.europa.eu/esco/occupation/49e28648-4fa8-4b36-ac4d-781c108547bf" },
      { title: "Supply Chain Manager", escoUri: "http://data.europa.eu/esco/occupation/aacc3918-b5d3-484b-9480-5d29aa550d74" },

      { title: "Air Traffic Controller", escoUri: "http://data.europa.eu/esco/occupation/3c2da05f-eb24-41f7-8307-46c96660fee0" },
      { title: "Port Coordinator", escoUri: "http://data.europa.eu/esco/occupation/fa404a79-4091-47f9-a635-c2e3c576ece8" },
      { title: "Flight Attendant", escoUri: "http://data.europa.eu/esco/occupation/f20d3ae6-baeb-482c-b68d-c2fb115e5dde" },

      { title: "Rail Logistics Coordinator", escoUri: "http://data.europa.eu/esco/occupation/279c0ab1-212b-4e89-a41f-048f5de9dadf" },
      { title: "Road Operations Manager", escoUri: "http://data.europa.eu/esco/occupation/4ea620f2-5c75-49ee-85a0-b2fb6bbf3624" },
      { title: "Forwarding Manager", escoUri: "http://data.europa.eu/esco/occupation/39803100-c338-4f01-ad2c-085d488920ca" },


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

      { title: "Pensions Administrator", escoUri: "http://data.europa.eu/esco/occupation/6724e558-2d75-4116-a473-91a4c14d4c69" },
      { title: "Customs Officer", escoUri: "http://data.europa.eu/esco/occupation/5f16819d-50b9-475b-a2d8-607ee6d99a9d" },
      { title: "Urban Planner", escoUri: "http://data.europa.eu/esco/occupation/e14548c8-c2b9-4ef8-8670-d5967d7ad804" },

      { title: "Community Development Officer", escoUri: "http://data.europa.eu/esco/occupation/39e9fc8f-02bd-4577-b603-2dc96204ce74" },
      { title: "Public Housing Manager", escoUri: "http://data.europa.eu/esco/occupation/5cff1eee-9027-4064-8a26-35b1877e4eb3" },
      { title: "Public Affairs Consultant", escoUri: "http://data.europa.eu/esco/occupation/9e285322-2cfa-430f-9b66-41be57d698e2" },

      { title: "Immigration Officer", escoUri: "http://data.europa.eu/esco/occupation/6296faea-1909-4943-b0e0-662b43ad855d" },
      { title: "Public Health Policy Officer", escoUri: "http://data.europa.eu/esco/occupation/d4d6842b-27f0-4222-85db-c542acf6d434" },
      { title: "Labour Relations Officer", escoUri: "http://data.europa.eu/esco/occupation/20b9f370-6b56-4679-8c06-c23b866a5bd0" },

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
      { title: "UI Designer", escoUri: "http://data.europa.eu/esco/occupation/96e20037-0a25-4bf6-a25e-808d1605d890" },
      { title: "Interior Designer", escoUri: "http://data.europa.eu/esco/occupation/73e776fb-4d99-4031-bad4-7716f121155d" },

      { title: "Art Director", escoUri: "http://data.europa.eu/esco/occupation/cb93fd23-1f51-4495-867a-936c1967066b" },
      { title: "Fashion Designer", escoUri: "http://data.europa.eu/esco/occupation/77bfd6e7-5598-4818-84cb-31e2651eb046" },
      { title: "Actor/Actress", escoUri: "http://data.europa.eu/esco/occupation/26171f39-e85a-448f-bd28-a73a5a99927f" },

      { title: "Video & Motion Picture Director", escoUri: "http://data.europa.eu/esco/occupation/1a7fb683-6544-4442-b54c-ec72ef468ff0" },
      { title: "Animator", escoUri: "http://data.europa.eu/esco/occupation/48c8eccb-4bd0-487e-a187-4953cbbe956e" },
      { title: "Musician", escoUri: "http://data.europa.eu/esco/occupation/f6803a58-91d9-4251-9a07-09fc387cec16" },


      // ...
    ],
  },
];