# Prompt: Convert Co-Authorship Network to Rankless.org-Style Static Graph Layout

## Context & Goal

**Current State:** The project [experts-su](file:///Users/egehanpala/Desktop/ENS491:2/experts-su) is a Sabancı University academic experts platform built with **Next.js**. The author profile page ([page.tsx](file:///Users/egehanpala/Desktop/ENS491:2/experts-su/services/web-frontend/src/app/authors/%5Bid%5D/page.tsx)) includes a "Network Collaboration" tab that renders a [CoAuthorshipGraph](file:///Users/egehanpala/Desktop/ENS491:2/experts-su/services/web-frontend/src/components/CoAuthorshipGraph.tsx) component — a **force-directed, canvas-based, interactive graph** powered by `react-force-graph-2d` and `d3-force`. It has a dark background (`#1e293b` / `#0f172a`), cluster-based coloring, drag/zoom/pan, a hover tooltip, dual-search/path-finding, and a legend overlay.

**Target State:** Redesign the co-authorship network visualization to match the **static graph layout style used on [rankless.org](https://rankless.org)** (specifically their scholar author pages, e.g. `rankless.org/authors/onur-varol`). The existing **Sabancı University color theme** (navy `#002855`, gold `#fbbf24`, blue `#3b82f6`, cluster colors, and the dark-mode panel aesthetic) must be **preserved**.

---

## What Rankless.org Does (Reference Design)

Rankless.org author pages feature a **co-authorship network** section with these characteristics:

### Layout & Rendering
- **Static, pre-computed SVG** — NOT a live force simulation. Node positions are computed once (server-side or on first load) and then rendered as an SVG `<svg>` element.
- **No canvas** — everything is SVG elements (`<circle>`, `<line>`, `<text>`, `<g>`), enabling native CSS transitions and hover effects without a rendering loop.
- **No `react-force-graph-2d`** — the graph is a hand-rolled SVG composition. Positions may be pre-computed using a force simulation that runs to completion before rendering (i.e., "offline" simulation).
- The graph is rendered inside a card-like container with a heading, descriptive text, and a toggleable "⚙ Controls" panel.

### Visual Style
- **Clean white/light background** with the graph rendered directly — no dark inset panel.
- **Nodes** are simple SVG circles with:
  - **Fill color** indicating cluster/community membership
  - **Stroke (border) width** proportional to the number of papers the author published with the center author
  - Uniform-ish node size (not dramatically scaled)
- **Edges** are SVG `<line>` elements with:
  - **Stroke width** proportional to the number of co-authored papers between two nodes
  - Light gray color (`rgba(0,0,0,0.1)` to `rgba(0,0,0,0.25)`)
- **Labels** are SVG `<text>` elements rendered next to nodes, using a monospace font (`Courier New`), small font size (~12px in SVG units), positioned near each node.
- **Legend** is an HTML element below the graph explaining what edge width and node border represent. It includes a toggleable controls panel.
- The description text below reads: _"This figure shows the co-authorship network connecting the top 25 collaborators of [Author]. A scholar is included among the top collaborators based on the total number of citations received by their joint publications. **Widths of edges** represent the number of papers authors have co-authored together. **Node borders** signify the number of papers an author published with [Author]. [Author] is excluded from the visualization to improve readability."_

### Interactions
- **Hover on node**: highlights the node and its direct connections (connected edges become more opaque/thicker, non-connected elements dim)
- **No drag** — nodes are fixed in place
- **No zoom/pan** — the SVG is sized to fit its container; the graph is designed to be readable at its rendered size
- **Click on node**: navigates to that author's profile page
- **Controls panel** (toggled by a button): may include sliders or checkboxes for filtering (e.g., year range, collaborator limit)

---

## What Needs to Change in the Codebase

### 1. Component: `CoAuthorshipGraph.tsx`
**File:** [CoAuthorshipGraph.tsx](file:///Users/egehanpala/Desktop/ENS491:2/experts-su/services/web-frontend/src/components/CoAuthorshipGraph.tsx) (~1193 lines)

**Major changes:**
- **Remove `react-force-graph-2d`** dependency and its dynamic import.
- **Remove `d3-force` runtime simulation** from `useEffect` hooks.
- **Replace canvas rendering** (`nodeCanvasObject`, `linkWidth`, `linkColor` callbacks) with **static SVG** rendering.
- **Pre-compute layout positions**: On data load, run a d3-force simulation **synchronously to completion** (e.g., `d3.forceSimulation(nodes).force(...).stop(); for (let i = 0; i < 300; i++) sim.tick();`), then store the final `x, y` positions and render them statically.
- **Render as SVG**: Use a `<svg>` element with:
  - `<line>` elements for edges (stroke-width proportional to `link.value`)
  - `<circle>` elements for nodes (fill = cluster color, stroke-width ∝ `joint_papers`)
  - `<text>` elements for labels (author names, positioned below/beside nodes)
- **Hover behavior**: Use React `onMouseEnter`/`onMouseLeave` on SVG `<g>` groups to highlight connected nodes and dim others. Use CSS transitions (`opacity`, `stroke-width`) for smooth effects.
- **Keep existing controls** (year range, collaborator limit, affiliation filter, dual search) but move them into a collapsible "⚙ Controls" panel below the graph, similar to Rankless.
- **Keep the bottom summary row** and **top collaborators table** — those are already good.

### 2. Styling Adaptation (Keep Current Theme)
- **DO NOT** change the color scheme. Keep:
  - Dark panel background (`#1e293b`, `#0f172a`) for the outer container
  - Cluster colors: `CLUSTER_COLORS` array (`#3b82f6`, `#81C784`, `#FFB74D`, `#BA68C8`, `#F06292`, `#4DB6AC`, `#DCE775`, `#FF8A65`, `#9575CD`, `#A1887F`)
  - Sabancı blue `#002855` for headings in the page
  - Monospace font for labels (`"Courier New", Courier, monospace`)
- **The graph SVG background** should be the current dark `#0f172a` (unlike Rankless's white). This keeps our dark-mode aesthetic.
- Edge colors should be semi-transparent light gray on dark: `rgba(148, 163, 184, 0.3)` → `rgba(148, 163, 184, 0.75)` on hover
- Node label text should be light (`#f8fafc` or `#cbd5e1`) on the dark background

### 3. Data Flow (No Backend Changes Needed)
The existing API endpoint stays the same:
```
GET /authors/{id}/network?year_from=X&year_to=Y&limit=Z
```
Returns: `{ center_author_name, nodes: [...], links: [...] }`

The frontend just needs to:
1. Fetch the data (already working)
2. Run the force layout **to completion** client-side
3. Render the final positions as SVG

### 4. Package Changes
- **Remove** `react-force-graph-2d` from `package.json` (it's currently used only in this component)
- **Keep** `d3-force` — still needed for the one-time position computation
- Optionally add `d3-scale` if you want to use `d3.scaleLog` for cleaner scaling (or keep the existing `logScale` helper)

### 5. Files Affected

| File | Change |
|------|--------|
| [CoAuthorshipGraph.tsx](file:///Users/egehanpala/Desktop/ENS491:2/experts-su/services/web-frontend/src/components/CoAuthorshipGraph.tsx) | **Major rewrite** — replace canvas/force-graph with static SVG |
| [page.tsx (author)](file:///Users/egehanpala/Desktop/ENS491:2/experts-su/services/web-frontend/src/app/authors/%5Bid%5D/page.tsx) | Minor — the component import stays the same, no changes needed |
| [package.json](file:///Users/egehanpala/Desktop/ENS491:2/experts-su/services/web-frontend/package.json) | Remove `react-force-graph-2d` dependency |
| [globals.css](file:///Users/egehanpala/Desktop/ENS491:2/experts-su/services/web-frontend/src/app/globals.css) | Possibly add SVG-specific hover/transition styles |

---

## Detailed Visual Spec for the New Component

### SVG Structure
```svg
<svg viewBox="0 0 {width} {height}" class="co-authorship-svg">
  <!-- Edges layer (render first, behind nodes) -->
  <g class="edges-layer">
    <line x1={...} y1={...} x2={...} y2={...} 
          stroke="rgba(148, 163, 184, 0.3)" 
          stroke-width={logScale(link.value, ...)} 
          class="edge" />
    <!-- ... more lines ... -->
  </g>
  
  <!-- Nodes layer -->
  <g class="nodes-layer">
    <g class="node-group" data-id={node.id}>
      <circle cx={node.x} cy={node.y} r={5} 
              fill={clusterColor} 
              stroke="#ffffff" 
              stroke-width={logScale(node.joint_papers, ...)} />
      <text x={node.x} y={node.y + 12} 
            text-anchor="middle" 
            font-size="5" 
            fill="#cbd5e1"
            font-family="'Courier New', Courier, monospace">
        {node.name}
      </text>
    </g>
    <!-- ... more nodes ... -->
  </g>
</svg>
```

### Hover Behavior (CSS + React)
```css
.co-authorship-svg .node-group {
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.co-authorship-svg .edge {
  transition: opacity 0.2s ease, stroke-width 0.15s ease;
}

/* When a node is hovered, dim everything else */
.co-authorship-svg.has-hover .node-group:not(.highlighted) {
  opacity: 0.12;
}

.co-authorship-svg.has-hover .edge:not(.highlighted) {
  opacity: 0.05;
}

.co-authorship-svg.has-hover .edge.highlighted {
  stroke: rgba(148, 163, 184, 0.95);
}
```

### Controls Panel (Below the Graph)
```
┌───────────────────────────────────────────────────────┐
│ Co-authorship network of co-authors of {AuthorName}   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │                                                 │  │
│  │              [Static SVG Graph]                 │  │
│  │                                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ⚙ Controls  [toggle button]                         │
│  ┌─── (collapsible) ────────────────────────────────┐ │
│  │ Year Range: [2021] — [2026]                      │ │
│  │ Limit: [-] 25 [+]                                │ │
│  │ Filter: [🌐 All] [🏛 Internal] [🌍 External]    │ │
│  │ Search: [Author 1...] ↔ [Author 2...]           │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  This figure shows the co-authorship network...       │
│  **Widths of edges** represent the number of papers   │
│  authors have co-authored together.                   │
│  **Node borders** signify the number of papers an     │
│  author published with {AuthorName}.                  │
│                                                       │
│  LEGEND                                               │
│  ● Collaborator                                       │
│  — Edge Width ∝ Shared Works                          │
│  ◉ Border ∝ Joint Papers (Center)                     │
└───────────────────────────────────────────────────────┘
```

---

## Implementation Strategy

### Phase 1: Pre-compute Layout
1. Keep the existing `fetch` logic.
2. After data arrives, create a `d3.forceSimulation` with the same forces (link, charge, collide, center, cluster-pull, gravity).
3. Run it to completion synchronously: `sim.stop(); for (let i = 0; i < 300; i++) sim.tick();`
4. Store final `node.x` / `node.y` in state.

### Phase 2: SVG Rendering
1. Remove `ForceGraph2D` dynamic import.
2. Render a responsive `<svg>` with `viewBox` computed from the bounding box of all node positions (with padding).
3. Render edges as `<line>`, nodes as `<circle>` + `<text>`.
4. Apply visual scaling (edge width, node border width) using the existing `logScale` helper.

### Phase 3: Interactions
1. Add `onMouseEnter`/`onMouseLeave` to each node `<g>` group.
2. On hover, compute the set of connected node IDs and edge keys.
3. Apply CSS classes (`.highlighted`, `.has-hover`) to toggle opacity.
4. On click, navigate with `router.push(/authors/${node.id})`.
5. Keep path-finding highlight from dual search (color path nodes/edges differently).

### Phase 4: Controls & Legend
1. Move the existing control buttons (year range, limit, affiliation, search) into a collapsible panel below the SVG.
2. Add the descriptive text paragraph (matching Rankless's wording, adapted for this project).
3. Keep the existing legend items but render them as HTML below the graph instead of overlaid on it.

---

## What to Preserve (Do NOT Change)

- ✅ Current Sabancı color theme (`--su-blue`, `--su-gold`, cluster colors)
- ✅ Dark panel aesthetic for the graph section
- ✅ Data API and data flow  
- ✅ Affiliation filter (All/Internal/External)
- ✅ Year range filter
- ✅ Collaborator limit control  
- ✅ Dual-author search with path highlighting
- ✅ Bottom summary row (Core Researcher, Filtered Collaborators, Total Joint Citations, Active Period)
- ✅ Top Collaborators table below the graph
- ✅ Navigation to author profiles on click
- ✅ Hover tooltip info (joint papers, joint citations)
- ✅ Monospace font family throughout
- ✅ The rest of the author profile page (tabs, header, other sections)

## What to Remove

- ❌ `react-force-graph-2d` package and its dynamic import
- ❌ Live force simulation (continuous `d3ReheatSimulation`, `cooldownTicks`)
- ❌ Canvas-based rendering (`nodeCanvasObject`, `nodePointerAreaPaint`)
- ❌ Drag interaction (`enableNodeDrag`)
- ❌ Real-time zoom/pan (the SVG should be "fit to container")
- ❌ The floating "Recenter Network" button (not needed with a static SVG)
- ❌ Animated directional particles on links (`linkDirectionalParticles`)
