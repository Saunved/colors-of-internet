export function generateColor(idx = 0, vibrancy = "high") {
    // Configure color parameters based on vibrancy level
    let saturation, lightness;

    switch (vibrancy) {
        case "neon":
            saturation = 100;
            lightness = 60;
            break;
        case "vibrant":
            saturation = 90;
            lightness = 55;
            break;
        case "high":
            saturation = 85;
            lightness = 50;
            break;
        case "medium":
            saturation = 70;
            lightness = 60;
            break;
        case "pastel":
            saturation = 70;
            lightness = 80;
            break;
        default:
            saturation = 85;
            lightness = 50;
    }

    // Generate well-distributed hues across the spectrum using prime numbers
    // to avoid repetitive patterns
    const hueRange = 360;
    const goldenRatioConjugate = 0.618033988749895;

    // Use both the index and a prime-based offset to create good distribution
    const hue = (((idx * goldenRatioConjugate) % 1) * hueRange +
        ((idx * 31 + 137) % hueRange)) % hueRange;

    return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%, #a#)`;
}