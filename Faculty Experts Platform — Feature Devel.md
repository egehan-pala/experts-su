Faculty Experts Platform — Feature Development Plan
8 new features inspired by Northeastern Faculty Experts, Aalto Research Portal, and Rankless.org. Each feature is scoped as an independent task that can be assigned to a team member.

Current State of experts-su
The platform currently has:
Homepage: Search bar + paginated faculty expert cards (photo, name, department, email, phone)
Author Profile Page: Photo, name, department, ORCID, areas of interest, interactive citations bar chart, top cited paper, "Research Galaxy" bubble visualization, and CoAuthorshipGraph
Search Page: Semantic search with intent detection (person/topic/mixed)


Feature 1 — Expertise Tags on Expert Cards (Homepage)
Inspired by: Northeastern Faculty Experts
What It Does
Each expert card on the homepage shows clickable expertise/topic tags beneath the contact info. Clicking a tag filters the directory to show all experts in that domain.
Backend Changes
MODIFY authors.py in api-gateway/routes/
Update GET /authors endpoint to return a new expertise_tags: string[] field per author
Source from areas_of_interest text (split by comma/semicolon) or OpenAlex concepts
Frontend Changes
MODIFY page.tsx (homepage)
Update Author interface to include expertise_tags?: string[]
Render 3-5 tags below email on each card as pill badges
onClick → router.push("/search?q=<tag>")
Add .expertise-tag CSS class in globals.css — pill shape, #002855 background, white text
Prompt to Give the AI
Add clickable expertise tags to each faculty expert card on the homepage. Each card should display up to 5 pill-shaped tags from their areas_of_interest or OpenAlex concepts. Clicking a tag should navigate to /search?q=<tag_text>. Style the tags as small pills with Sabancı blue background (#002855) and white text. Update the backend /authors endpoint to include an expertise_tags array in the response.

Feature 2 — Citation & Publication Timeline Chart (Profile Page)
Inspired by: Rankless.org + Aalto Research Portal
What It Does
A dual-axis bar chart on the author profile page showing publications per year (blue bars up) and citations per year (red bars mirrored down), creating a butterfly/bilateral timeline.
Backend Changes
No backend changes needed — uses existing /authors/{id}/metrics endpoint
Frontend Changes
NEW CitationTimelineChart.tsx in components/charts/
Use Recharts BarChart with two Bar series (publications positive, citations negative/mirrored)
Add Tooltip, XAxis (years), YAxis, and Legend
Add year range dropdown filter (last 10, 20, all years)
MODIFY author profile page.tsx — import and render between header and Research Galaxy
Prompt to Give the AI
Create a new CitationTimelineChart.tsx in components/charts/. It should render a bilateral/mirrored bar chart using Recharts showing publications per year going upward (Sabancı blue #002855) and citations per year mirrored downward (Sabancı red #d6001c). Add a year range dropdown filter (last 10, 20, all years). Hover should show counts. Use the existing metrics data from the author profile page (year, pub_count, citations). Add it to the author profile page between the header and Research Galaxy sections.

Feature 3 — Research Fingerprint Visualization (Profile Page)
Inspired by: Aalto Research Portal "Fingerprint" Tab
What It Does
A visual map of the researcher's expertise using donut-ring badges grouped by discipline. Each badge shows a research concept with a circular progress ring indicating the weight/relevance of that topic.
Backend Changes
NEW GET /authors/{id}/fingerprint endpoint
Query OpenAlex concepts for the author's works
Return { field: string, concepts: { name: string, weight: number }[] }[]
Frontend Changes
NEW FingerprintChart.tsx in components/charts/
Render concept badges as small cards with SVG donut rings
Group by field with color-coded headers
Add sort toggle (by weight / alphabetically)
MODIFY author profile page to add Fingerprint section after Research Galaxy
Prompt to Give the AI
Create a "Research Fingerprint" section for the author profile page — inspired by Aalto University's research portal. Add a new GET /authors/{id}/fingerprint API endpoint that returns the author's research concepts grouped by field (from OpenAlex). Each concept has a name and weight (0-1). Create a FingerprintChart.tsx component that displays concept badges as small cards with SVG donut-ring progress indicators. Group badges by field with color-coded headers. Each donut ring fill percentage represents the concept weight. Add sort toggles for "by weight" and "alphabetical". Use a 6-color palette for the discipline groups.

Feature 4 — Collaboration World Map (Profile Page)
Inspired by: Aalto Network Map View + Rankless Geographic Impact Map
What It Does
An interactive world map showing where the researcher's co-authors come from geographically. Countries are shaded by collaboration intensity.
Backend Changes
NEW GET /authors/{id}/geo-collaborations endpoint
Aggregate co-author institutions by country from OpenAlex data
Return { country_code, country_name, collaboration_count }[]
Frontend Changes
NEW CollaborationMap.tsx in components/charts/
Use react-simple-maps to render a world choropleth
Color intensity based on collaboration count
Tooltip on hover shows country name and count
MODIFY author profile page — add below CoAuthorshipGraph
DEPENDENCY: npm install react-simple-maps @types/topojson-specification
Prompt to Give the AI
Create a "Collaboration Map" feature for the author profile page. Add a GET /authors/{id}/geo-collaborations backend endpoint that aggregates co-author institution countries from existing OpenAlex data and returns { country_code, country_name, collaboration_count } per country. Create a CollaborationMap.tsx component using react-simple-maps to render a world choropleth map. Countries should be shaded from light blue to dark Sabancı blue (#002855) based on collaboration count. Add tooltip on hover showing country name and count. Place it below the CoAuthorshipGraph on the author profile page.

Feature 5 — Publications List with Filters (Profile Page)
Inspired by: Aalto Publications Tab + Rankless "Find Top Paper"
What It Does
A full publication listing on the author profile page with year filters, sort options, and Open Access badges. Currently the profile page has publications removed.
Backend Changes
MODIFY GET /authors/{id}/works to support pagination (page, limit)
Add sort_by param (citations|year)
Add year filtering (year_from, year_to)
Add title search (q param)
Return title, year, venue, citation_count, is_open_access, doi, type
Frontend Changes
NEW PublicationList.tsx component
Render publications as a clean list with citation counts
Year range filter dropdown, sort toggle, search input, pagination
Open Access badge (green lock icon)
"Find Top Paper" button that highlights the most cited work
MODIFY author profile page — add below chart/graph sections
Prompt to Give the AI
Create a full publication listing for the author profile page. Ensure the backend GET /authors/{id}/works endpoint supports pagination (page, limit), sorting (sort_by=citations|year), year filtering (year_from, year_to), and title search (q). Create a PublicationList.tsx component that renders publications as a clean list — each entry shows title, year, venue/journal, citation count, and an Open Access badge (green lock icon if is_open_access). Include a year range filter, sort toggle, search input, pagination, and a "Find Top Paper" button that highlights the most cited work. Place it on the author profile page below the chart/graph sections.

Feature 6 — Research Flow Sankey Diagram (Profile Page)
Inspired by: Rankless "Papers by Author" Sankey
What It Does
A Sankey (flow) diagram showing how research flows from the author into different journals, fields, or topics. Users can toggle between the three views.
Backend Changes
NEW GET /authors/{id}/research-flow endpoint
Query params: breakdown=journals|fields|topics, since=<year>, limit=<N>
Return { source, target, value }[] for Sankey links
Frontend Changes
NEW ResearchFlowSankey.tsx in components/charts/
Use d3-sankey library
Toggle buttons for Journals / Fields / Topics
"Since" year dropdown, volume control slider
Color nodes by category
MODIFY author profile page — add after Research Galaxy
DEPENDENCY: npm install d3-sankey @types/d3-sankey
Prompt to Give the AI
Create a "Research Flow" Sankey diagram for the author profile page, inspired by Rankless.org. Add a GET /authors/{id}/research-flow endpoint with params breakdown (journals/fields/topics), since (year), and limit (number of categories). It should return Sankey link data: { source, target, value }[]. Create ResearchFlowSankey.tsx using d3-sankey. Add toggle buttons for Journals/Fields/Topics, a "Since" year dropdown, and a volume slider for top N. Color the nodes by category using a vibrant palette. Place it on the author profile page.

Feature 7 — Similar Experts Section (Profile Page)
Inspired by: Aalto "Similar Profiles" + Rankless Impact Fingerprint Comparison
What It Does
At the bottom of a profile page, show 5-6 experts with similar research areas. Each card includes shared topics for quick comparison.
Backend Changes
NEW GET /authors/{id}/similar endpoint
Use existing embedding vectors to find nearest 6 authors by cosine similarity
Return { id, name, dept, image_url, shared_topics: string[], similarity_score }[]
Frontend Changes
NEW SimilarExperts.tsx component
Horizontal scrollable row of 6 cards
Each card: photo, name, department, shared topic pills, similarity %
Click → navigate to /authors/{id}
MODIFY author profile page — add as last section before footer
Prompt to Give the AI
Create a "Similar Experts" section at the bottom of the author profile page. Add a GET /authors/{id}/similar backend endpoint that uses embedding vectors (already in author_embeddings table) to find the 6 most similar authors by cosine similarity. Return id, name, dept, image_url, shared_topics, and similarity_score. Create SimilarExperts.tsx with a horizontally scrollable row of 6 cards — each card shows photo, name, department, shared topics as small pills, and a similarity percentage. Cards should be clickable and navigate to the author's profile.

Feature 8 — Department / Faculty Filter on Homepage
Inspired by: Northeastern Expertise Tag Filtering + Aalto Research Units
What It Does
A filter bar on the homepage allowing users to filter experts by department/faculty (FENS, FASS, SBS, SL, etc.) without using the search bar.
Backend Changes
MODIFY GET /authors endpoint to accept dept query parameter for filtering
Frontend Changes
NEW DepartmentFilter.tsx component
Horizontal row of toggle buttons: All, FENS, FASS, SBS, SL
Active state styling with Sabancı blue (#002855) background
On click → update URL search params and trigger data refetch
MODIFY page.tsx (homepage) — add below search section, read dept from URL params
Prompt to Give the AI
Add a department/faculty filter bar to the homepage. Create DepartmentFilter.tsx — a horizontal row of toggle buttons: "All", "FENS", "FASS", "SBS", "SL". Active filter gets Sabancı blue (#002855) background with white text. Clicking a filter updates URL params (?dept=FENS) and triggers re-fetch. Update the homepage page.tsx to read the dept URL param and pass it to the GET /authors endpoint. Update the backend GET /authors endpoint to support an optional dept query parameter for filtering.

Summary Table

Suggested Task Assignments