"""Render a clean system-architecture diagram as a PNG for the report."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.lines import Line2D

fig, ax = plt.subplots(figsize=(11, 8.5), dpi=200)
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis("off")

ORANGE = "#FF9900"   # AWS orange
NAVY = "#1F3A5F"
BLUE = "#2E73B8"
GREEN = "#3C8C40"
GREY = "#6B7280"
LIGHT = "#F2F5F9"


def box(x, y, w, h, text, fc, ec=NAVY, fontsize=9, tc="white", bold=True):
    p = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.2",
                       linewidth=1.4, edgecolor=ec, facecolor=fc, zorder=3)
    ax.add_patch(p)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            fontsize=fontsize, color=tc, weight="bold" if bold else "normal",
            zorder=4, linespacing=1.3)


def arrow(x1, y1, x2, y2, color=GREY, style="-|>", lw=1.6, ls="-"):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style,
                        mutation_scale=14, linewidth=lw, color=color,
                        linestyle=ls, zorder=2)
    ax.add_patch(a)


def label(x, y, text, color=GREY, fontsize=7.5, style="italic"):
    ax.text(x, y, text, ha="center", va="center", fontsize=fontsize,
            color=color, style=style, zorder=5)


# ---- Users ----
box(38, 92, 24, 5.5, "Internet — Users\n(desktop / mobile / tablet)", "white", ec=GREY,
    tc=NAVY, fontsize=9)

# ---- CloudFront ----
box(36, 80, 28, 6, "Amazon CloudFront\n(CDN + HTTPS edge, redirect-to-https)", ORANGE,
    tc="white", fontsize=8.5)
arrow(50, 92, 50, 86.2, color=NAVY)
label(63, 89, "HTTPS (TLS)", color=NAVY)

# ---- S3 + ALB ----
box(8, 66, 26, 7, "Amazon S3\nFaculty photos\n(/assets/faculty/*)", GREEN, tc="white", fontsize=8.5)
box(50, 66, 30, 7, "Application Load Balancer\n(2 AZ, health checks,\npath-based routing)", ORANGE,
    tc="white", fontsize=8.5)
arrow(42, 80, 24, 73.3, color=GREY)
label(28, 78, "/assets/*", color=GREY)
arrow(58, 80, 64, 73.3, color=GREY)
label(72, 78, "default (/)", color=GREY)

# ---- VPC boundary ----
vpc = FancyBboxPatch((4, 6), 92, 54, boxstyle="round,pad=0.4,rounding_size=1.5",
                     linewidth=1.8, edgecolor=BLUE, facecolor=LIGHT,
                     linestyle=(0, (6, 3)), zorder=1)
ax.add_patch(vpc)
ax.text(7, 57.5, "VPC  10.0.0.0/16   (Region eu-west-1, 2 Availability Zones)",
        ha="left", va="center", fontsize=9, color=BLUE, weight="bold", zorder=5)

# ---- Public subnet ----
pub = FancyBboxPatch((8, 33), 84, 20, boxstyle="round,pad=0.3,rounding_size=1",
                     linewidth=1.2, edgecolor=GREEN, facecolor="white", zorder=2)
ax.add_patch(pub)
ax.text(11, 50.5, "PUBLIC SUBNETS  10.0.1.0/24 (AZ-a) , 10.0.4.0/24 (AZ-b)",
        ha="left", va="center", fontsize=8, color=GREEN, weight="bold", zorder=5)
box(20, 36, 60, 11,
    "EC2  t3.small   (Docker Compose)\n\n"
    "web-frontend (Next.js, :3000)      api-gateway (FastAPI, :8000)",
    NAVY, tc="white", fontsize=8.5)
arrow(64, 66, 55, 47.2, color=GREY)
label(78, 56, "/authors*  /search*  (API)\n/ (frontend)", color=GREY, fontsize=7)

# ---- Private subnet ----
priv = FancyBboxPatch((8, 10), 84, 18, boxstyle="round,pad=0.3,rounding_size=1",
                      linewidth=1.2, edgecolor="#B23B3B", facecolor="white", zorder=2)
ax.add_patch(priv)
ax.text(11, 25.6, "ISOLATED PRIVATE SUBNETS  10.0.2.0/24 , 10.0.3.0/24   (no internet route)",
        ha="left", va="center", fontsize=8, color="#B23B3B", weight="bold", zorder=5)
box(24, 12.5, 52, 9.5,
    "Amazon RDS  PostgreSQL 15\n+ pgvector + pg_trgm",
    "#5B2A86", tc="white", fontsize=9)
arrow(50, 36, 50, 22.2, color="#B23B3B")
label(62, 29.5, "5432  (only from EC2 SG)", color="#B23B3B")

# ---- Side services ----
ax.text(95.5, 47, "Internet\nGateway", ha="center", va="center", fontsize=7.5,
        color=BLUE, weight="bold", rotation=0)
arrow(92, 43.5, 88, 43.5, color=BLUE, lw=1.2)

# ---- Observability strip ----
box(8, 1.0, 84, 4.0,
    "Observability:  CloudWatch (2 log groups + 6 alarms)  ->  SNS  ->  e-mail        "
    "Access:  IAM role on EC2 (no static keys)  •  Security Groups as firewalls",
    "#37474F", tc="white", fontsize=7.5)

ax.text(50, 99.2, "Figure 1 — Experts@SU System Architecture on AWS",
        ha="center", va="center", fontsize=11, color=NAVY, weight="bold")

plt.tight_layout()
out = "/Users/berke/Desktop/experts-su/architecture.png"
plt.savefig(out, bbox_inches="tight", facecolor="white")
print("Saved:", out)
