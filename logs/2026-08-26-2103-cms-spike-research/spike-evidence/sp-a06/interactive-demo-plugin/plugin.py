def validate(block, services):
    services.trace("validator")
    if not all(key in block for key in ("html", "css", "js", "fallback")):
        raise ValueError("DEMO_SOURCE_INCOMPLETE")


def render(block, services):
    services.trace("renderer")
    return {
        "html": block["html"],
        "css": block["css"],
        "js": block["js"],
        "fallback": block["fallback"],
    }


def assets(services):
    services.trace("assets")
    return {"interactive-demo.css": ".demo { display: block; }"}
