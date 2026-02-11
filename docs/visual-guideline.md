# Visual Design Guideline: Immersive Dark Glass

Objective: Adapt the "Vision UI" aesthetic for a web interface. Focus on depth, lighting, and glass textures. Do not create a dashboard layout; apply this style to our specific web content.

## 1. Core Atmosphere
Vibe: Futuristic, Premium, Deep Space.

Key Concept: Elements should feel like they are floating in a 3D space, illuminated by a cool, ambient light source.

Rule: No flat black (#000000). Always use deep blues or indigos to maintain richness.

## 2. Color Palette
Global Background:

Use a deep, linear gradient.

Reference: Deep Navy (#0F172A) fading into Dark Violet/Black.

Surface / Cards:

Fill: White with extremely low opacity (2% - 5%).

Context: Rely on backdrop-filter (blur) to separate the card from the background, not solid colors.

Primary Accent:

Electric Blue: High saturation (e.g., #0075FF or #22D3EE).

Usage: CTAs, active states, and key highlights.

Typography Colors:

Headings: Pure White (#FFFFFF).

Body: Cool Gray / Blue-Gray (#A0AEC0). Avoid warm or neutral grays.

## 3. The "Glass" Component (Critical)
Every container or card must follow this physics simulation:

Texture: Backdrop-filter: blur(20px) (Heavy blur).

The "Light" Border:

Do not use a solid border. Use a 1px Gradient Border.

Direction: Top-Left (White, 40% opacity) to Bottom-Right (White, 5% opacity).

Effect: This simulates light hitting the glass edge from the top-left.

Shape: Generous rounded corners (20px+).

## 4. Lighting & Depth
Glow Effects:

Primary buttons and icons should emit light.

Technique: Colored Drop Shadow (e.g., Blue button gets a blurred blue shadow).

Elevation:

Use soft, large, dark shadows behind glass cards to detach them from the background.

Goal: Create a "floating" effect.

## 5. Imagery & Graphics
Style: 3D Abstract, Fluid forms, Glass spheres, or Holographic elements.

Lighting Match: Ensure visual assets have cool (blue/cyan) lighting to match the UI.

Avoid: Flat vector illustrations or standard corporate stock photos.