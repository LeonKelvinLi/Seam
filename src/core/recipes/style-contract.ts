import type { TransitionRecipe } from "./types";

/** Observable distinctions between the styles shown in the library. Shared by direction and judging. */
export const STYLE_REQUIREMENTS: Readonly<Record<string, string>> = {
  "dolly-through": "The camera travels forward with visible depth and parallax, passes a foreground element, and reveals the destination beyond it. A flat zoom or stationary morph is not a dolly through.",
  orbit: "The viewpoint arcs around a main subject: its visible side changes while the background sweeps behind it. The destination appears during that arc. Rotating the image, zooming straight in, or only morphing is not an orbit.",
  "push-through": "The camera steadily pushes into a visible detail until it fills the view and carries us through into the destination. A pull-back, sideways move, or stationary morph is not a push through.",
  "pull-out-reveal": "The camera pulls backward from a detail, revealing progressively more surroundings until the destination is revealed. The visual scale must decrease; pushing forward is the opposite effect.",
  "foreground-pass": "A foreground element visibly sweeps across the lens, conceals the scene change, then clears to reveal the destination. A plain wipe or a morph without a passing foreground element does not match.",
  "object-occlusion": "A physical object approaches or covers the lens, briefly occludes the view, then uncovers the destination. A fade to black or an unexplained dark frame is not object occlusion.",
  "shape-match": "A specific visible shape in the source aligns with a corresponding shape in the destination and visibly carries the transformation. A generic move with no identifiable shape correspondence does not match.",
  "composition-match": "The main subject or visual anchor keeps its screen position and framing as the surrounding scene becomes the destination. A large reframing or unrelated move does not match.",
  "motion-match": "An identifiable subject or camera motion continues in the same direction and rhythm through the transformation into the destination. A static morph or direction reversal does not match.",
  "object-match": "An identifiable source object transforms into a corresponding destination object, with their form and screen placement visibly connected. Only changing the background does not match.",
  "silhouette-match": "A recognisable subject outline is retained as it becomes the destination outline. The connecting silhouette must be visible, not merely two unrelated scenes.",
  "color-match": "A visible patch of source colour expands to fill the view and reveals the destination from the corresponding colour. A global colour grade or ordinary fade does not match.",
  "object-morph": "A specific source object visibly changes its physical shape into a destination object. The object itself must transform; a camera move or background replacement alone does not match.",
  "environment-morph": "The surrounding environment visibly rebuilds into the destination while spatial continuity is maintained. A single small object changing or a dissolve is not an environment morph.",
  "material-transform": "A source surface visibly changes material or texture into a destination surface while its form remains recognisable through the change. A lighting or colour change alone does not match.",
  "liquid-transform": "Visible source liquid physically flows, ripples, swells or reshapes into the destination. Merely moving past a liquid, changing the background, or dissolving two images does not match.",
  "smoke-transform": "Visible smoke, steam or fog moves across or expands through the frame, then clears or reshapes into the destination. A plain fade or unrelated cloud background does not match.",
  "fabric-transform": "Visible cloth or fabric sweeps, folds or billows across the view and reveals the destination as it moves away. A non-fabric wipe or stationary morph does not match.",
  "glass-transform": "A glass-like surface visibly refracts or distorts the source and opens or resolves into the destination. Ordinary blur, a dissolve, or a simple scene replacement does not match.",
  "object-becomes-environment": "A recognisable source object grows or changes scale until its surface and structure become the destination environment. The object-to-world relationship must remain visibly traceable.",
  "portal-door": "The destination appears through a real door or archway and the camera passes through that opening. Changing the entire scene without crossing the doorway does not match.",
  "portal-window": "The destination is visible inside a window and the camera advances through that window until the destination fills the view. A generic zoom or background morph outside the window does not match.",
  "portal-phone": "The destination appears inside the phone screen, and the camera enters the screen until its content fills the view. The screen must visibly serve as the opening.",
  "portal-tv": "The destination appears inside a television or display and expands as the camera enters that screen. Replacing the room without entering the display does not match.",
  "portal-mirror": "The mirror reflection becomes the destination and the camera crosses through the mirror surface into it. The mirror must be the visible entry point.",
  "portal-cup": "The camera moves into the cup opening and its interior or liquid becomes the destination, preserving the rim as the entry boundary. Going around the cup or only changing the background does not match.",
  "portal-tunnel": "The camera travels into and through an enclosing tunnel or passage, with the destination revealed at the far end. A flat zoom or open-space morph does not match.",
  "portal-car-window": "The camera crosses a vehicle window and the destination takes over from the view through that window. The window frame must visibly establish the crossing.",
};

export function styleRequirement(recipe: TransitionRecipe): string {
  return STYLE_REQUIREMENTS[recipe.id] ?? recipe.description;
}
