"""Score distributions: the range of points a Player might score in a gameweek.

v1 shape, per Fixture: the Player doesn't play (0 points) with probability
1 - q, where q is his expected share of minutes. If he plays he scores 2
(appearance) plus returns that arrive in chunks of CHUNK points (a goal,
assist or clean sheet) as a Poisson count, sized so the distribution's
average is exactly his Projection. A double gameweek adds two Fixtures'
distributions; a blank gameweek is always 0.

This is deliberately simple and replaceable, like the Model. It treats
Players as independent, which understates how much teammates' scores move
together.
"""
import math

CHUNK = {1: 4, 2: 4, 3: 5, 4: 4}   # typical size of one return, by position
APPEARANCE = 2
DECIMALS = 3                         # published probability precision


def fixture_distribution(q, m, pos):
    """{points: probability} for one Fixture. q = chance of playing,
    m = expected points if he plays."""
    q = min(max(q, 0.0), 1.0)
    if q == 0 or m <= 0:
        return {0: 1.0}
    if m < 1:                        # a cameo at best: 1 point or nothing
        return {0: 1 - q * m, 1: q * m}
    if m < APPEARANCE:               # 1 or 2 points, averaging m
        return {0: 1 - q, 1: q * (APPEARANCE - m), 2: q * (m - 1)}
    s = CHUNK[pos]
    lam = (m - APPEARANCE) / s
    dist = {0: 1 - q} if q < 1 else {}
    n, p, total = 0, math.exp(-lam), 0.0
    while total < 1 - 1e-9 and n < 60:
        pts = APPEARANCE + s * n
        dist[pts] = dist.get(pts, 0.0) + q * p
        total += p
        n += 1
        p *= lam / n
    return dist


def convolve(a, b):
    out = {}
    for x, px in a.items():
        for y, py in b.items():
            out[x + y] = out.get(x + y, 0.0) + px * py
    return out


def gameweek_distribution(parts, pos):
    """Combine a gameweek's Fixtures, given as [(q, m)], into one distribution."""
    dist = {0: 1.0}
    for q, m in parts:
        dist = convolve(dist, fixture_distribution(q, m, pos))
    return dist


def mean(dist):
    return sum(x * p for x, p in dist.items())


def compact(dist):
    """[[points…], [probabilities…]] rounded to DECIMALS, dropping outcomes that
    round to 0 and topping the largest up so the probabilities sum to 1."""
    unit = 10 ** DECIMALS
    kept = {x: round(p * unit) for x, p in dist.items() if round(p * unit) > 0}
    if not kept:
        return [[0], [1.0]]
    biggest = max(kept, key=kept.get)
    kept[biggest] += unit - sum(kept.values())
    pts = sorted(kept)
    return [pts, [kept[x] / unit for x in pts]]
