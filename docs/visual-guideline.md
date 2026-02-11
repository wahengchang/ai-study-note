# Visual Design Guideline

**Objective:** High-density, terminal-style UI. Prioritize raw utility and information density. **Rule:** No gradients, no shadows, no blur effects.

## **1\. Design Tokens (Colors)**

| Scope | Token Name | Value (Hex) | Usage |
| :---- | :---- | :---- | :---- |
| **Base** | bg-global | \#050505 | Main page background (Deep Black) |
| **Surface** | bg-card | \#000000 | Card/Container fill (Pure Black) |
| **Border** | border-default | \#333333 | 1px dividers, card outlines |
| **Border** | border-active | \#FF4F00 | Active states, focus rings |
| **Accent** | brand-orange | \#FF4F00 | Primary buttons, links, alerts |
| **Text** | text-primary | \#E5E5E5 | Body text, primary content |
| **Text** | text-muted | \#737373 | Metadata, timestamps, footnotes |

## **2\. Typography**

**Font Stacks:**

* **Monospace (Data/Headers):** JetBrains Mono, Fira Code, or ui-monospace.  
  * *Apply to:* Headings (h1-h6), tags, dates, code blocks, navigation links.  
* **Sans-Serif (Body):** Inter, Geist, or system-ui.  
  * *Apply to:* Long-form paragraphs to maintain readability.

**Scale:**

* Keep sizes small and dense. Base size: 14px.

## **3\. Component Specs**

### **Cards & Containers ("The Wireframe")**

* **Border:** 1px solid \#333333  
* **Background:** transparent or \#000000  
* **Border Radius:** 8px (Fixed. Do not use pills/circles).  
* **Box Shadow:** none (Strict rule).  
* **Padding:** 16px (Compact).

### **Buttons**

* **Style:** Outline only or Solid Block.  
* **Default:** 1px Border (\#333333), Text (\#E5E5E5).  
* **Hover:** Border (\#FF4F00), Text (\#FF4F00).  
* **Active/Primary:** Background (\#FF4F00), Text (\#FFFFFF), Border (\#FF4F00).

## **4\. Layout & Grid**

* **Structure:** Masonry / Dense Grid.  
* **Spacing (Gap):** 12px to 16px strictly.  
* **Container Width:** Fluid, max-width 100% with minimal margins. Avoid excessive whitespace.

## **5\. Interaction States**

* **Hover:** Do not lift (no shadow).  
  * *Action:* Change border color to Lighter Grey (\#555) or Accent Orange (\#FF4F00).  
  * *Action:* Slight background shift to \#111111.  
* **Status Indicators:** Use 6px solid circles.  
  * *Online:* \#00CC00  
  * *Offline/Error:* \#FF4F00

## **6\. Assets**

* **Icons:** Stroke-based (e.g., Lucide, Phosphor). 16px or 20px.  
* **Images:** No rounded corners on internal images unless they match the container 8px. No conceptual 3D art.