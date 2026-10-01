/* ==========================================================================
   MetalField — one raymarched liquid-metal field that "remembers" shapes.
   Liquid (metaballs) <-> carabiner / 6-DOF arm / mini CNC / split-shell
   enclosure, morphed by blending signed distance functions.
   No geometry, no libraries: one fullscreen triangle, one fragment shader.
   ========================================================================== */
(function () {
  "use strict";

  var FS = [
    "#version 300 es",
    "precision highp float;",
    "out vec4 outColor;",
    "uniform vec2 uRes; uniform float uTime;",
    "uniform vec2 uWell; uniform float uWellA;",
    "uniform float uRipT; uniform vec2 uRipP;",
    "uniform float uMat;",
    "uniform int uShape; uniform float uLiquid;",
    "uniform vec2 uShift; uniform float uFocal; uniform float uBound;",
    "uniform mat3 uRot;",
    "uniform float uGate; uniform float uGrip;",
    "uniform vec3 uS; uniform vec3 uE; uniform vec3 uW; uniform vec3 uT;",
    "uniform vec3 uCnc; uniform float uSpin; uniform float uOpen;",
    "uniform vec3 uAccent;",
    "",
    "const int MAX_STEPS = 110;",
    "const float SURF = 0.0011;",
    "",
    "float smin(float a,float b,float k){ float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0); return mix(b,a,h)-k*h*(1.0-h); }",
    "float sph(vec3 p, vec3 c, float r){ return length(p-c)-r; }",
    "float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0); }",
    "float sdRBox(vec3 p, vec3 b, float r){ return sdBox(p,b-r)-r; }",
    "float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h)-r; }",
    "float cyl(vec2 q, float r, float h){ vec2 d=abs(q)-vec2(r,h); return min(max(d.x,d.y),0.0)+length(max(d,0.0)); }",
    "float sdCylY(vec3 p,float r,float h){ return cyl(vec2(length(p.xz),p.y),r,h); }",
    "float sdCylZ(vec3 p,float r,float h){ return cyl(vec2(length(p.xy),p.z),r,h); }",
    "float sdCylX(vec3 p,float r,float h){ return cyl(vec2(length(p.yz),p.x),r,h); }",
    "mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }",
    "",
    "/* ---------- liquid: six convecting droplets + a cursor gravity well ---------- */",
    "float blobs(vec3 p){",
    "  float t = uTime;",
    "  p += 0.02*sin(p.yzx*3.4 + t*0.6);",
    "  vec3 c0 = vec3( 1.30*sin(t*0.41),      0.70*sin(t*0.33+1.0), 0.34*sin(t*0.27));",
    "  vec3 c1 = vec3(-1.15*sin(t*0.37+2.0),  0.78*cos(t*0.29),    -0.30*sin(t*0.31+0.5));",
    "  vec3 c2 = vec3( 0.42*sin(t*0.53+4.0), -1.00*sin(t*0.23+2.0), 0.40*cos(t*0.19));",
    "  vec3 c3 = vec3(-0.50*cos(t*0.47),     -0.72*sin(t*0.43+1.0),-0.34*sin(t*0.37));",
    "  vec3 c4 = vec3( 0.80*sin(t*0.61+3.0),  0.14*sin(t*0.51),     0.30*sin(t*0.44+2.0));",
    "  vec3 c5 = vec3( 0.06*sin(t*0.35),      0.06*cos(t*0.4),      0.0);",
    "  float k = 0.40;",
    "  float d = sph(p,c0,0.42);",
    "  d = smin(d, sph(p,c1,0.38), k);",
    "  d = smin(d, sph(p,c2,0.34), k);",
    "  d = smin(d, sph(p,c3,0.32), k);",
    "  d = smin(d, sph(p,c4,0.28), k);",
    "  d = smin(d, sph(p,c5,0.46), k*1.15);",
    "  d = smin(d, sph(p, vec3(uWell,0.0), 0.09+0.32*uWellA), 0.5);",
    "  return d;",
    "}",
    "",
    "/* ---------- carabiner: flat four-point star frame, inward spring gate, star charm ---------- */",
    "float ndot(vec2 a, vec2 b){ return a.x*b.x-a.y*b.y; }",
    "float sdRhombus(vec2 p, vec2 b){ p=abs(p); float h=clamp(ndot(b-2.0*p,b)/dot(b,b),-1.0,1.0); float d=length(p-0.5*b*vec2(1.0-h,1.0+h)); return d*sign(p.x*b.y+p.y*b.x-b.x*b.y); }",
    "// four-point star: a rhombus with each side bowed inward by a disc (sag = how deep the bow is)",
    "float star2(vec2 p, vec2 b, float sag){",
    "  vec2 q=abs(p); float c=length(b); float r=(c*c*0.25+sag*sag)/(2.0*sag);",
    "  vec2 C=b*0.5+normalize(vec2(b.y,b.x))*(r-sag);",
    "  return max(sdRhombus(q,b), r-length(q-C));",
    "}",
    "float extrude(float d2, float z, float h, float r){ vec2 w=vec2(d2+r, abs(z)-h+r); return min(max(w.x,w.y),0.0)+length(max(w,0.0))-r; }",
    "const vec2 CB=vec2(0.56,1.12); const float CSAG=0.11, CW=0.068, CZ=0.064, CRR=0.026;",
    "const vec2 GL=vec2(-0.56,0.0), GT=vec2(0.0,1.12);",
    "float carBand(vec2 p){ return abs(star2(p,CB,CSAG)-0.014+CW)-CW; }",
    "// the gate is the stretch of the upper-left side between these two fractions",
    "float gateReg(vec2 p){",
    "  vec2 e=normalize(GT-GL), n=vec2(-e.y,e.x); float L=length(GT-GL), s=dot(p-GL,e);",
    "  return max(max(0.16*L-s, s-0.70*L), -0.42-dot(p-GL,n));",
    "}",
    "vec2 gateHinge(){ vec2 e=normalize(GT-GL), n=vec2(-e.y,e.x); return GL+e*(0.16*length(GT-GL))-n*0.14; }",
    "float carGate(vec3 p){",
    "  vec2 H=gateHinge(); vec2 g=H+rot(uGate*0.5)*(p.xy-H);",
    "  return max(extrude(carBand(g), p.z, CZ*0.9, CRR), gateReg(g));",
    "}",
    "float carabiner(vec3 p){",
    "  float d = extrude(carBand(p.xy), p.z, CZ, CRR);",
    "  d = max(d, 0.012-gateReg(p.xy));",
    "  d = min(d, carGate(p));",
    "  d = min(d, sdCylZ(p-vec3(gateHinge(),0.0), 0.024, CZ+0.007));",
    "  float ch = extrude(star2(p.xy-vec2(0.3,0.36), vec2(0.13,0.22), 0.018)-0.012, p.z-0.07, 0.03, 0.012);",
    "  return smin(d, ch, 0.008);",
    "}",
    "",
    "/* ---------- 6-DOF arm: arrow base, servo tower, channel upper arm, textured forearm, two-jaw gripper ---------- */",
    "// p in a link's frame: x along a->b (centred), y across, z out of plane; hl = half length",
    "vec3 lf(vec3 p, vec3 a, vec3 b, out float hl){",
    "  vec2 d=b.xy-a.xy; float L=max(length(d),1e-4); vec2 u=d/L, r=p.xy-a.xy; hl=L*0.5;",
    "  return vec3(dot(r,u)-hl, u.x*r.y-u.y*r.x, p.z);",
    "}",
    "float armHorns(vec3 p){",
    "  vec3 a=p-uS; a.z=abs(a.z)-0.172; vec3 b=p-uE; b.z=abs(b.z)-0.112;",
    "  float d=sdCylZ(a,0.074,0.012);",
    "  d=max(d, -(length(abs(a.xy)-0.031)-0.012));",
    "  float e=sdCylZ(b,0.064,0.012);",
    "  e=max(e, -(length(abs(b.xy)-0.027)-0.011));",
    "  return min(d,e);",
    "}",
    "float armBase(vec3 p){",
    "  vec3 q=p-vec3(0.0,-1.12,0.0);",
    "  float flat2=max(max(abs(q.x)-0.6, abs(q.z)-0.48), dot(vec2(abs(q.x),q.z),vec2(0.6,0.8))-0.5);",
    "  float d=max(sdRBox(q, vec3(0.6,0.035,0.48), 0.03), flat2);",
    "  d=max(d, -sdBox(q-vec3(0.0,0.0,0.5), vec3(0.035,0.1,0.2)));",
    "  vec2 c=mod(q.xz+0.045,0.09)-0.045;",
    "  d=max(d, -max(sdBox(vec3(c.x,q.y-0.035,c.y), vec3(0.016,0.012,0.011)), flat2+0.07));",
    "  float ring=length(vec2(length(vec2(q.x,q.z+0.48))-0.15, q.y))-0.035;",
    "  return min(d, max(ring, q.z+0.42));",
    "}",
    "float armTower(vec3 p){",
    "  float d=sdRBox(p-vec3(0.05,-0.86,0.0), vec3(0.17,0.22,0.16), 0.03);",
    "  d=max(d, -sdBox(p-vec3(0.05,-0.88,0.16), vec3(0.11,0.13,0.07)));",
    "  d=min(d, sdRBox(p-vec3(0.05,-0.88,0.05), vec3(0.1,0.11,0.1), 0.012));",
    "  d=min(d, sdRBox(p-vec3(-0.25,-0.9,0.0), vec3(0.09,0.18,0.15), 0.03));",
    "  return min(d, sdRBox(p-uS-vec3(0.0,-0.02,0.0), vec3(0.15,0.14,0.165), 0.03));",
    "}",
    "float arm(vec3 p){",
    "  float d = min(armBase(p), armTower(p));",
    "  float h1; vec3 q=lf(p,uS,uE,h1);",
    "  float up = sdRBox(q, vec3(h1,0.082,0.11), 0.04);",
    "  up = min(up, sdCylZ(q-vec3(h1,0.0,0.0), 0.1, 0.11));",
    "  up = max(up, -sdBox(q-vec3(0.0,0.085,0.0), vec3(h1-0.17,0.03,0.07)));",
    "  up = max(up, -sdCylZ(q-vec3(-h1+0.32,0.0,0.0), 0.055, 0.2));",
    "  d = min(d, up);",
    "  float h2; q=lf(p,uE,uW,h2);",
    "  float fo = sdRBox(q, vec3(h2,0.07,0.085), 0.03);",
    "  fo = min(fo, sdRBox(q+vec3(h2,0.0,0.0), vec3(0.12,0.105,0.095), 0.03));",
    "  vec3 t=q; t.z=abs(t.z)-0.085;",
    "  vec2 c=vec2(t.x+t.y,t.x-t.y)*0.7071; c=mod(c+0.026,0.052)-0.026;",
    "  fo = max(fo, -max(sdBox(vec3(c,t.z),vec3(0.011,0.011,0.012)), max(abs(q.x)-(h2-0.14), abs(q.y)-0.05)));",
    "  d = min(d, fo);",
    "  float h3; q=lf(p,uW,uT,h3);",
    "  vec3 g=q+vec3(h3,0.0,0.0);",
    "  float gr = sdRBox(g-vec3(0.02,0.0,0.0), vec3(0.085,0.085,0.1), 0.025);",
    "  gr = min(gr, sdRBox(g-vec3(0.16,-0.01,0.0), vec3(0.07,0.08,0.075), 0.02));",
    "  vec3 j=g-vec3(0.22,-0.06,0.0); float w=mix(0.032,0.012,clamp(j.x/0.3,0.0,1.0));",
    "  float fj=sdBox(vec3(j.x-0.15,j.y,j.z), vec3(0.15,w,0.032));",
    "  float tx=mod(j.x,0.05)-0.025;",
    "  fj=max(fj, -max(sdBox(vec3(tx,j.y-w,j.z), vec3(0.012,0.012,0.05)), 0.04-j.x));",
    "  gr = min(gr, fj);",
    "  vec3 m=g-vec3(0.2,0.045,0.0); m.xy=rot(-(0.5*(1.0-uGrip)-0.08))*m.xy;",
    "  float w2=mix(0.028,0.011,clamp(m.x/0.24,0.0,1.0));",
    "  gr = min(gr, sdBox(vec3(m.x-0.12,m.y,m.z), vec3(0.12,w2,0.03)));",
    "  d = min(d, gr);",
    "  return min(d, armHorns(p));",
    "}",
    "/* ---------- mini CNC: gantry, rails, lead screw, spindle, moving bed ---------- */",
    "float cncBit(vec3 p){",
    "  vec3 tb = p-vec3(uCnc.x, -0.46+uCnc.z, 0.2);",
    "  float fa = atan(tb.z, tb.x);",
    "  float fl = 0.024 + 0.006*sin(fa*2.0 + tb.y*60.0 + uSpin);",
    "  return max(length(tb.xz)-fl, abs(tb.y)-0.1)*0.8;",
    "}",
    "float cnc(vec3 p){",
    "  float d = sdRBox(p-vec3(0.0,-1.02,0.0), vec3(1.25,0.06,0.8), 0.02);",
    "  vec3 q = p; q.x = abs(q.x);",
    "  d = min(d, sdRBox(q-vec3(1.05,-0.22,-0.4), vec3(0.1,0.78,0.13), 0.02));",
    "  d = min(d, sdRBox(p-vec3(0.0,0.5,-0.4), vec3(1.15,0.07,0.13), 0.02));",
    "  d = min(d, sdCylX(p-vec3(0.0,0.32,-0.22), 0.03, 0.97));",
    "  d = min(d, sdCylX(p-vec3(0.0,0.02,-0.22), 0.03, 0.97));",
    "  vec3 ls = p-vec3(0.0,0.17,-0.25);",
    "  float ang = atan(ls.z, ls.y);",
    "  float thr = 0.04 + 0.009*sin(ang + (ls.x-uCnc.x)*48.0);",
    "  d = min(d, max(length(ls.yz)-thr, abs(ls.x)-0.97)*0.8);",
    "  d = min(d, sdRBox(p-vec3(uCnc.x,0.17,-0.1), vec3(0.2,0.22,0.08), 0.025));",
    "  d = min(d, sdRBox(p-vec3(uCnc.x,0.14+uCnc.z,0.06), vec3(0.13,0.2,0.05), 0.02));",
    "  vec3 mo = p-vec3(uCnc.x, 0.0+uCnc.z, 0.2);",
    "  d = smin(d, sdCylY(mo, 0.11, 0.2)-0.012, 0.02);",
    "  d = min(d, sdCylY(mo-vec3(0.0,-0.28,0.0), 0.05, 0.08));",
    "  d = min(d, cncBit(p));",
    "  d = min(d, sdRBox(p-vec3(0.0,-0.9,uCnc.y), vec3(0.62,0.05,0.42), 0.02));",
    "  d = min(d, sdRBox(p-vec3(0.0,-0.78,uCnc.y), vec3(0.42,0.07,0.28), 0.012));",
    "  q = p; q.x = abs(q.x);",
    "  d = min(d, sdCylZ(q-vec3(0.45,-0.975,0.0), 0.025, 0.75));",
    "  return d;",
    "}",
    "",
    "/* ---------- split-shell enclosure: tray, PCB, two hinging top halves ---------- */",
    "float shellHalf(vec3 p, float tongue){",
    "  // right half; pivots about its outer bottom edge as the seam opens",
    "  vec2 piv = vec2(1.1,-0.12);",
    "  p.xy = rot(uOpen*1.05)*(p.xy-piv)+piv;",
    "  p.y -= uOpen*0.08;",
    "  vec3 hp = p - vec3(0.55,-0.01,0.0);",
    "  vec3 sb = vec3(0.55,0.11,0.72);",
    "  float s = abs(sdRBox(hp, sb, 0.05)+0.022)-0.022;",
    "  s = max(s, -(hp.y+sb.y-0.07));",
    "  s = max(s, -(hp.x+sb.x-0.07));",
    "  vec3 v = hp; v.z = mod(v.z+0.06,0.12)-0.06;",
    "  float slot = sdRBox(v-vec3(0.08,sb.y,0.0), vec3(0.28,0.06,0.018), 0.01);",
    "  slot = max(slot, abs(hp.z)-0.5);",
    "  s = max(s, -slot);",
    "  if(tongue>0.5) s = min(s, sdRBox(hp-vec3(-sb.x-0.035,sb.y-0.04,0.0), vec3(0.06,0.011,0.66), 0.005));",
    "  return s;",
    "}",
    "float encPCB(vec3 p){",
    "  float d = sdBox(p-vec3(0.0,-0.4,0.0), vec3(0.94,0.012,0.58));",
    "  return d;",
    "}",
    "float enclosure(vec3 p){",
    "  vec3 tp = p-vec3(0.0,-0.32,0.0);",
    "  vec3 tb = vec3(1.1,0.2,0.72);",
    "  float d = abs(sdRBox(tp,tb,0.06)+0.024)-0.024;",
    "  d = max(d, tp.y-(tb.y-0.07));",
    "  d = min(d, encPCB(p));",
    "  d = min(d, sdRBox(p-vec3(0.25,-0.372,0.12), vec3(0.42,0.012,0.12), 0.005));",
    "  d = min(d, sdRBox(p-vec3(-0.45,-0.355,-0.18), vec3(0.18,0.035,0.18), 0.012));",
    "  d = min(d, sdRBox(p-vec3(-0.5,-0.34,0.28), vec3(0.1,0.05,0.07), 0.01));",
    "  vec3 cs = p; cs.xz = abs(cs.xz);",
    "  d = min(d, sdCylY(cs-vec3(0.98,-0.1,0.6), 0.04, 0.025)-0.005);",
    "  d = min(d, shellHalf(p, 1.0));",
    "  d = min(d, shellHalf(vec3(-p.x,p.y,p.z), 0.0));",
    "  return d;",
    "}",
    "",
    "float shapeSDF(vec3 q){",
    "  if(uShape==1){ float b = sdBox(q, vec3(0.66,1.2,0.12)); return b>0.2 ? b : carabiner(q); }",
    "  if(uShape==2){ float b = length(q-vec3(0.0,-0.3,0.0))-2.45; return b>0.2 ? b : arm(q); }",
    "  if(uShape==3){ q *= 1.25; float b = sdBox(q-vec3(0.0,-0.2,0.0), vec3(1.3,0.9,0.85)); return (b>0.2 ? b : cnc(q))*0.8; }",
    "  q *= 1.15; float b = sdBox(q-vec3(0.0,0.1,0.0), vec3(1.75,0.9,0.8)); return (b>0.2 ? b : enclosure(q))/1.15;",
    "}",
    "float accentSDF(vec3 q){",
    "  if(uShape==1) return 1.0;  // all one polished metal, like the real part",
    "  if(uShape==2) return armHorns(q);",
    "  if(uShape==3) return cncBit(q*1.25)*0.8;",
    "  return encPCB(q*1.15)/1.15;",
    "}",
    "",
    "float map(vec3 p){",
    "  float L = uLiquid; float d;",
    "  if(uShape==0 || L>0.999){ d = blobs(p); }",
    "  else {",
    "    vec3 q = uRot*p;",
    "    if(L>0.001){ q += (0.06*L)*sin(q.yzx*3.6 + uTime*1.4); q.y += 0.25*L*L*sin(q.x*1.7+uTime); }",
    "    float ds = shapeSDF(q);",
    "    d = (L>0.001) ? mix(ds, blobs(p), smoothstep(0.0,1.0,L)) : ds;",
    "  }",
    "  if(uRipT < 1.6){",
    "    float rr = uRipT*3.2;",
    "    float ring = abs(length(p.xy-uRipP)-rr);",
    "    d -= 0.12*(1.0-uRipT/1.6)*exp(-ring*ring*7.0);",
    "  }",
    "  return d;",
    "}",
    "",
    "vec3 calcNormal(vec3 p){",
    "  const vec2 k = vec2(1.0,-1.0); const float e = 0.0012;",
    "  return normalize(k.xyy*map(p+k.xyy*e)+k.yyx*map(p+k.yyx*e)+k.yxy*map(p+k.yxy*e)+k.xxx*map(p+k.xxx*e));",
    "}",
    "",
    "vec3 envColor(vec3 rd){",
    "  float up = clamp(rd.y*0.5+0.5,0.0,1.0);",
    "  vec3 sky = mix(vec3(0.020,0.015,0.010), vec3(0.045,0.038,0.028), smoothstep(0.0,0.5,up));",
    "  sky = mix(sky, vec3(0.11,0.10,0.085), smoothstep(0.5,1.0,up));",
    "  vec3 L1 = normalize(vec3( 0.45,0.75, 0.5));",
    "  vec3 L2 = normalize(vec3(-0.65,0.35,-0.6));",
    "  vec3 L3 = normalize(vec3( 0.15,-0.55,0.4));",
    "  vec3 L4 = normalize(vec3(-0.8, 0.1, 0.45));",
    "  sky += vec3(1.0,0.97,0.90)*smoothstep(0.86,0.995,dot(rd,L1))*1.7;",
    "  sky += vec3(0.55,0.68,1.0)*smoothstep(0.80,0.99, dot(rd,L2))*0.7;",
    "  sky += vec3(1.0,0.85,0.6) *smoothstep(0.90,0.998,dot(rd,L3))*0.9;",
    "  // a long strip softbox — gives machined parts a crisp highlight line",
    "  float strip = smoothstep(0.1,0.0,abs(dot(rd,L4)-0.35))*smoothstep(-0.2,0.4,rd.y);",
    "  sky += vec3(0.8,0.85,0.95)*strip*0.35;",
    "  sky += vec3(0.06)*smoothstep(0.05,0.0,abs(rd.y+0.02));",
    "  return sky;",
    "}",
    "",
    "void materialParams(vec3 n, vec3 rd, float m, out vec3 baseTint, out float metal, out float rough, out vec3 iri){",
    "  vec3 gold=vec3(1.0,0.68,0.24), chrome=vec3(0.92,0.94,0.98), obs=vec3(0.30,0.26,0.42);",
    "  vec3 t01=mix(gold,chrome,clamp(m,0.0,1.0));",
    "  vec3 t12=mix(chrome,obs,clamp(m-1.0,0.0,1.0));",
    "  vec3 t23=mix(obs,vec3(0.7),clamp(m-2.0,0.0,1.0));",
    "  baseTint = m<1.0 ? t01 : (m<2.0 ? t12 : t23);",
    "  float ob = clamp(m-1.0,0.0,1.0)*clamp(3.0-m,0.0,1.0);",
    "  metal = 1.0-0.55*ob;",
    "  rough = mix(mix(0.12,0.05,clamp(m,0.0,1.0)), 0.18, ob);",
    "  float fw = clamp(m-2.0,0.0,1.0);",
    "  float ct = clamp(dot(n,-rd),0.0,1.0);",
    "  float ph = (1.0-ct)*10.0 + uTime*0.3;",
    "  iri = fw*(0.5+0.5*cos(vec3(ph,ph+2.1,ph+4.2)));",
    "}",
    "",
    "void main(){",
    "  vec2 uv = (gl_FragCoord.xy*2.0-uRes)/uRes.y;",
    "  vec3 ro = vec3(0.0,0.0,5.0);",
    "  vec3 rd = normalize(vec3(uv-uShift, -uFocal));",
    "  float b = dot(ro,rd), c = dot(ro,ro)-uBound*uBound, h = b*b-c;",
    "  bool hit=false; float t=0.0; vec3 p=ro;",
    "  if(h>0.0){",
    "    h = sqrt(h); t = max(0.0,-b-h); float tEnd = -b+h;",
    "    for(int i=0;i<MAX_STEPS;i++){",
    "      p = ro+rd*t; float dist = map(p);",
    "      if(dist < SURF*(1.0+t*0.25)){ hit=true; break; }",
    "      t += dist*0.82;",
    "      if(t>tEnd) break;",
    "    }",
    "  }",
    "  vec3 bg = envColor(rd)*0.32;",
    "  bg = mix(bg, bg*vec3(0.7,0.72,0.85), 0.4);",
    "  vec3 col;",
    "  if(hit){",
    "    vec3 n = calcNormal(p); vec3 v = -rd;",
    "    float fres = pow(clamp(1.0-max(dot(n,v),0.0),0.0,1.0),5.0);",
    "    vec3 baseTint; float metal, rough; vec3 iri;",
    "    materialParams(n, rd, uMat, baseTint, metal, rough, iri);",
    "    vec3 refl = reflect(rd,n);",
    "    vec3 env = envColor(refl);",
    "    vec3 L1 = normalize(vec3(0.4,0.8,0.5));",
    "    float diff = max(dot(n,L1),0.0);",
    "    vec3 spec = vec3(pow(max(dot(refl,L1),0.0), mix(60.0,220.0,1.0-rough)));",
    "    float ao = clamp(0.35+0.65*map(p+n*0.09)/0.09, 0.0, 1.0);",
    "    float goldness = clamp(1.0-uMat,0.0,1.0);",
    "    vec3 reflTint = mix(baseTint, vec3(1.0), mix(0.42,0.12,goldness));",
    "    col = env*reflTint*(0.85+1.0*metal);",
    "    col += baseTint*(0.10+0.22*goldness)*(n.y*0.4+0.6)*ao;",
    "    col += baseTint*diff*0.30*(1.0-metal*0.5);",
    "    col += spec*(0.7+0.5*metal);",
    "    col = mix(col, env*1.2+baseTint*0.28, fres*0.72);",
    "    col += baseTint*pow(fres,1.5)*(0.4*goldness);",
    "    col += iri*(0.5+fres);",
    "    float darken = clamp(uMat-1.0,0.0,1.0)*clamp(3.0-uMat,0.0,1.0);",
    "    col = mix(col, col*vec3(0.24,0.22,0.34)+bg*0.25, darken*0.55);",
    "    // accent part (anodized gate, servo horns, hot bit, PCB)",
    "    if(uShape>0 && uLiquid<0.999){",
    "      vec3 q = uRot*p;",
    "      float am = (1.0-smoothstep(0.0,0.012,accentSDF(q)))*(1.0-uLiquid);",
    "      vec3 ac = uAccent*(0.25+0.75*diff) + env*uAccent*1.4 + spec*0.6;",
    "      col = mix(col, ac, am*0.85);",
    "    }",
    "    col *= mix(0.55,1.0,ao);",
    "    col *= 1.0-clamp(t/14.0,0.0,1.0)*0.25;",
    "  } else { col = bg; }",
    "  col = col/(col+vec3(0.9));",
    "  col = pow(col, vec3(0.4545));",
    "  col *= 1.0-0.25*dot(uv*0.6,uv*0.6);",
    "  outColor = vec4(col,1.0);",
    "}"
  ].join("\n");

  var VS = "#version 300 es\nin vec2 a; void main(){ gl_Position = vec4(a,0.0,1.0); }";

  // shape ids
  var LIQUID = 0, CARABINER = 1, ARM = 2, CNC = 3, ENCLOSURE = 4;
  // accent colour per shape (anodized pink gate, electric-blue servo horns, hot bit, PCB green)
  var ACCENTS = [[0, 0, 0], [1.0, 0.36, 0.58], [0.16, 0.52, 1.0], [1.0, 0.5, 0.16], [0.14, 0.62, 0.36]];
  // arm geometry (object units) — link ratios follow the real arm's 140 / 110 mm
  var ARM_S = [0, -0.62], L1 = 0.95, L2 = 0.76, L3 = 0.32;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }
  function angDiff(a, b) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

  // row-major 3x3 helpers; the shader evaluates q = R * p
  function matRot(yaw, pitch, roll) {
    // positive pitch = camera looks down onto the object's top
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = -Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    var Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
    var Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
    var Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
    // spin about the object's own axis first, then tilt/roll relative to the camera
    return mul(Ry, mul(Rx, Rz));
  }
  function mul(A, B) {
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++)
      C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return C;
  }
  function mv(M, v) { return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }

  function MetalField(canvas, opts) {
    opts = opts || {};
    var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var COARSE = matchMedia("(hover: none), (pointer: coarse)").matches;
    var self = this;
    this.ok = false;

    var gl = null;
    try { gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true }); } catch (e) { gl = null; }
    if (!gl) { fail("no webgl2"); return; }

    function compile(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error("shader error:", gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    var vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS), prog = null;
    if (vs && fs) {
      prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error("link error:", gl.getProgramInfoLog(prog)); prog = null; }
    }
    if (!prog) { fail("shader"); return; }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var aLoc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    var U = {};
    ["uRes", "uTime", "uWell", "uWellA", "uRipT", "uRipP", "uMat", "uShape", "uLiquid", "uShift", "uFocal", "uBound", "uRot",
      "uGate", "uGrip", "uS", "uE", "uW", "uT", "uCnc", "uSpin", "uOpen", "uAccent"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    /* ---------------- sizing + adaptive resolution ---------------- */
    var scale = opts.scale || 0.75, W = 1, H = 1, aspect = 1;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.max(1, Math.floor(innerWidth * dpr * scale));
      H = Math.max(1, Math.floor(innerHeight * dpr * scale));
      canvas.width = W; canvas.height = H;
      aspect = innerWidth / innerHeight;
      gl.viewport(0, 0, W, H);
    }
    resize();
    addEventListener("resize", resize);

    /* ---------------- state ---------------- */
    var S = {
      shape: LIQUID, shapeTarget: LIQUID, liquid: 1, liquidTarget: 1,
      mat: 0, matTarget: 0,
      align: "hero", shiftX: 0, shiftY: 0, focal: 2.2, focalTarget: 2.2,
      yaw: 0.4, pitch: 0.1, roll: 0, yawVel: 0, spinAuto: 0,
      gate: 0, gateVel: 0, grip: 0, gripTarget: 0,
      th: [1.2, -1.6, 0.2], thT: [1.2, -1.6, 0.2],
      cnc: [0, 0, 0], cncT: [0, 0, 0], plungeUntil: 0, spin: 0,
      open: 0.35, openLock: -1,
      hold: 0, holding: false, holdStart: 0,
      paused: false
    };
    var P = { x: innerWidth / 2, y: innerHeight / 2, has: false, lastMove: -1e9, vx: 0, down: false, downAt: 0, downNear: false, downX: 0, downY: 0, type: "mouse" };
    var well = [0, 0], wellA = 0, wellAT = 0;
    var rip = { t: 999, x: 0, y: 0 };

    /* screen <-> world helpers (camera at (0,0,5) looking -z, lens-shifted) */
    function uvOf(cx, cy) { return [((cx / innerWidth) * 2 - 1) * aspect - S.shiftX, (1 - (cy / innerHeight) * 2) - S.shiftY]; }
    function worldOnZ0(cx, cy) { var u = uvOf(cx, cy), k = 5 / S.focal; return [u[0] * k, u[1] * k]; }
    function center() { return [innerWidth / 2 + S.shiftX * innerHeight / 2, innerHeight / 2 - S.shiftY * innerHeight / 2]; }
    function radiusPx() { return 1.25 * S.focal / 5 * innerHeight / 2; }
    // intersect the pointer ray with the object's own z=0 plane (for arm IK)
    function objPlanePoint(cx, cy, R) {
      var u = uvOf(cx, cy), rd = [u[0], u[1], -S.focal], ro = [0, 0, 5];
      var r2 = [R[6], R[7], R[8]];
      var den = r2[0] * rd[0] + r2[1] * rd[1] + r2[2] * rd[2];
      if (Math.abs(den) < 1e-3) return null;
      var tt = -(r2[2] * 5) / den;
      if (tt < 0) return null;
      return mv(R, [ro[0] + rd[0] * tt, ro[1] + rd[1] * tt, ro[2] + rd[2] * tt]);
    }
    function nearObject(cx, cy) {
      if (S.shape === LIQUID || S.liquid > 0.6) return false;
      var c = center(), dx = cx - c[0], dy = cy - c[1], r = radiusPx() * 1.35;
      return dx * dx + dy * dy < r * r;
    }
    this.isNear = function () { return P.has && nearObject(P.x, P.y); };

    /* ---------------- input ---------------- */
    var lastPX = null;
    addEventListener("pointermove", function (e) {
      P.type = e.pointerType;
      if (e.pointerType !== "mouse") return;
      var now = performance.now();
      if (lastPX !== null) P.vx = e.clientX - lastPX;
      lastPX = e.clientX;
      P.x = e.clientX; P.y = e.clientY; P.has = true; P.lastMove = now; wellAT = 1;
      if (S.shape === CARABINER && nearObject(P.x, P.y) && !REDUCED) S.yawVel += clamp(P.vx, -60, 60) * 0.0045;
    }, { passive: true });
    document.addEventListener("pointerleave", function () { wellAT = 0; P.has = false; });
    addEventListener("blur", function () { wellAT = 0; P.has = false; P.down = false; S.holding = false; });

    addEventListener("pointerdown", function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      var tag = e.target && e.target.closest && e.target.closest("a,button,input,textarea,summary,label,select");
      var w = worldOnZ0(e.clientX, e.clientY);
      rip.x = w[0]; rip.y = w[1]; rip.t = 0;
      P.down = true; P.downAt = performance.now(); P.x = e.clientX; P.y = e.clientY;
      P.downNear = !tag && nearObject(e.clientX, e.clientY);
      P.downX = e.clientX; P.downY = e.clientY;
    }, { passive: true });
    addEventListener("pointerup", function (e) {
      var held = performance.now() - P.downAt;
      var moved = Math.hypot(e.clientX - P.downX, e.clientY - P.downY);
      // a click / tap: short and still. Touch drags that start on the object are scrolls, not taps.
      if (P.down && P.downNear && held < (e.pointerType === "mouse" ? 280 : 350) && moved < 10) action();
      P.down = false; S.holding = false;
    }, { passive: true });
    addEventListener("pointercancel", function () { P.down = false; S.holding = false; }, { passive: true });

    // a click on the formed object does the shape's "thing"
    function action() {
      if (S.shape === CARABINER) { S.gateVel = 7.5; }
      else if (S.shape === ARM) { S.gripTarget = S.gripTarget > 0.5 ? 0 : 1; }
      else if (S.shape === CNC) { S.plungeUntil = performance.now() + 900; }
      else if (S.shape === ENCLOSURE) { S.openLock = S.openLock === 1 ? 0 : 1; }
      if (opts.onAction) opts.onAction(S.shape);
    }

    /* ---------------- per-shape simulation ---------------- */
    var Rm = matRot(0, 0, 0), rotBuf = new Float32Array(9);
    var gcode = "";
    function simulate(dt, t, now) {
      var c = center(), rpx = radiusPx();
      var idle = !P.has || (now - P.lastMove > 3500) || COARSE;
      var nx = P.has ? clamp((P.x - c[0]) / (rpx * 2.2), -1.2, 1.2) : 0;
      var ny = P.has ? clamp((P.y - c[1]) / (rpx * 2.2), -1.2, 1.2) : 0;
      var motion = REDUCED ? 0 : 1;

      // hold to melt ("forget"); release and it remembers
      if (P.down && P.downNear && P.type === "mouse" && now - P.downAt > 280) S.holding = true;
      S.hold = damp(S.hold, S.holding ? 1 : 0, S.holding ? 2.2 : 3.5, dt);

      var yawT = S.yaw, pitchT = S.pitch, rollT = 0;
      if (S.shape === CARABINER) {
        S.spinAuto += dt * 0.35 * motion;
        S.yawVel *= Math.exp(-dt * 1.6);
        S.spinAuto += S.yawVel * dt;
        yawT = S.spinAuto + (idle ? 0 : nx * 0.9);
        pitchT = 0.12 + (idle ? 0.12 * Math.sin(t * 0.5) * motion : ny * 0.7);
        rollT = -0.22 + (idle ? 0 : -nx * 0.15);
        // gate: damped spring that clacks shut against the nose
        S.gateVel += (-S.gate * 60 - S.gateVel * 5.5) * dt;
        S.gate += S.gateVel * dt;
        if (S.gate < 0) { S.gate = 0; S.gateVel = -S.gateVel * 0.32; }
        if (S.gate > 1) { S.gate = 1; S.gateVel = 0; }
      } else if (S.shape === ARM) {
        yawT = -0.5 + 0.22 * Math.sin(t * 0.17) * motion; pitchT = 0.1; rollT = 0;
        var target;
        if (idle) {
          // pick-and-place style sweep over the top, never folding in on itself
          var sa = 1.5708 + 1.15 * Math.sin(t * 0.42 * motion), sr = 1.32 + 0.22 * Math.sin(t * 0.9 * motion + 1.0);
          target = [ARM_S[0] + sr * Math.cos(sa), ARM_S[1] + sr * Math.sin(sa)];
        } else { var q = objPlanePoint(P.x, P.y, Rm); target = q ? [q[0], q[1]] : [0.8, 0.2]; }
        var tdx = target[0] - ARM_S[0], tdy = target[1] - ARM_S[1], tr = Math.hypot(tdx, tdy) || 1, trc = clamp(tr, 1.05, 1.95);
        target = [ARM_S[0] + tdx / tr * trc, Math.max(ARM_S[1] + tdy / tr * trc, -0.8)];
        solveIK(target);
        for (var i = 0; i < 3; i++) S.th[i] += angDiff(S.th[i], S.thT[i]) * (1 - Math.exp(-5.5 * dt));
        S.grip = damp(S.grip, S.gripTarget, 9, dt);
      } else if (S.shape === CNC) {
        yawT = -0.62 + 0.12 * Math.sin(t * 0.2) * motion; pitchT = 0.36; rollT = 0;
        if (idle) {
          // trace a rounded-square toolpath like a GRBL job
          var s = (t * 0.22 * (motion || 0.001)) % 4, u = s % 1, side = Math.floor(s);
          var pts = [[-0.36, -0.22], [0.36, -0.22], [0.36, 0.22], [-0.36, 0.22]];
          var a0 = pts[side], a1 = pts[(side + 1) % 4];
          S.cncT[0] = lerp(a0[0], a1[0], u); S.cncT[1] = lerp(a0[1], a1[1], u);
        } else { S.cncT[0] = clamp(nx * 0.9, -0.4, 0.4); S.cncT[1] = clamp(ny * 0.6, -0.26, 0.26); }
        S.cncT[2] = now < S.plungeUntil ? -0.17 : 0;
        // stepper-like: constant feed rate toward target
        var feed = 0.9 * dt;
        for (var j = 0; j < 3; j++) { var dd = S.cncT[j] - S.cnc[j]; S.cnc[j] += clamp(dd, -feed, feed); }
        S.spin += dt * 42 * (motion || 0.2);
        gcode = "G1 X" + (S.cnc[0] * 100).toFixed(1) + " Y" + (-S.cnc[1] * 100).toFixed(1) + " Z" + (S.cnc[2] * 100).toFixed(1) + " F800";
      } else if (S.shape === ENCLOSURE) {
        S.spinAuto += dt * 0.18 * motion;
        yawT = S.spinAuto + (idle ? 0 : nx * 0.7); pitchT = 0.72 + (idle ? 0 : ny * 0.2); rollT = 0;
        var openT;
        if (S.openLock >= 0) openT = S.openLock;
        else if (idle) openT = 0.35 + 0.3 * Math.sin(t * 0.6) * motion;
        else openT = clamp(0.5 - ny * 0.9, 0, 1);
        S.open = damp(S.open, openT, 3.2, dt);
      }
      S.yaw = S.shape === CARABINER || S.shape === ENCLOSURE ? yawT : S.yaw + angDiff(S.yaw, yawT) * (1 - Math.exp(-2.5 * dt));
      S.pitch = damp(S.pitch, pitchT, 3, dt);
      S.roll = damp(S.roll, rollT, 3, dt);
      Rm = matRot(S.yaw, S.pitch, S.roll);
    }

    function solveIK(target) {
      var sx = ARM_S[0], sy = ARM_S[1];
      var dx = target[0] - sx, dy = target[1] - sy, dl = Math.hypot(dx, dy) || 1;
      var ux = dx / dl, uy = dy / dl;
      // tool points along the reach direction, tipped slightly down
      var toolA = Math.atan2(uy, ux) - 0.35;
      var wx = target[0] - Math.cos(toolA) * L3 - sx, wy = target[1] - Math.sin(toolA) * L3 - sy;
      var d = Math.hypot(wx, wy), dmin = Math.abs(L1 - L2) + 0.08, dmax = L1 + L2 - 0.02;
      if (d > dmax || d < dmin) { var k = clamp(d, dmin, dmax) / (d || 1); wx *= k; wy *= k; d = clamp(d, dmin, dmax); }
      var c2 = clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
      var elbow = wx >= 0 ? -1 : 1; // elbow stays up on either side
      var t2 = elbow * Math.acos(c2);
      var t1 = Math.atan2(wy, wx) - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
      S.thT[0] = t1; S.thT[1] = t2; S.thT[2] = toolA;
    }
    function armPoints() {
      var sx = ARM_S[0], sy = ARM_S[1], a = S.th[0], b = S.th[0] + S.th[1], c = S.th[2];
      var E = [sx + L1 * Math.cos(a), sy + L1 * Math.sin(a), 0];
      var Wp = [E[0] + L2 * Math.cos(b), E[1] + L2 * Math.sin(b), 0];
      var T = [Wp[0] + L3 * Math.cos(c), Wp[1] + L3 * Math.sin(c), 0];
      return [E, Wp, T];
    }

    /* ---------------- public controls ---------------- */
    this.setForm = function (shape, liquidTarget) {
      S.shapeTarget = clamp(shape | 0, 0, 4);
      var lt = liquidTarget == null ? (shape ? 0 : 1) : +liquidTarget;
      S.liquidTarget = isFinite(lt) ? clamp(lt, 0, 1) : 1;
    };
    this.setMaterial = function (i) { S.matTarget = i; };
    this.setAlign = function (a) { S.align = a; };
    this.setFocal = function (f) { S.focalTarget = f; };
    this.pause = function (p) {
      if (S.paused === !!p) return;
      S.paused = !!p;
      if (!S.paused && running) { last = performance.now(); schedule(); }
    };
    this.state = S;

    /* ---------------- frame loop ---------------- */
    var t0 = performance.now(), last = t0, frames = 0, acc = 0, fps = 60, lowFor = 0;
    var running = !document.hidden;
    document.addEventListener("visibilitychange", function () {
      running = !document.hidden;
      if (running && !S.paused) { last = performance.now(); schedule(); }
    });
    var queued = false;
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(frame); } }

    function alignShift() {
      var wide = aspect > 1.1;
      if (S.align === "right") return wide ? [Math.min(aspect * 0.44, 1.05), 0] : [0, 0.42];
      if (S.align === "hero") return wide ? [Math.min(aspect * 0.3, 0.72), 0.12] : [0, 0.35];
      return [0, 0];
    }

    function frame() {
      queued = false;
      if (!running || S.paused) return;
      var now = performance.now();
      var realDt = Math.max(0, (now - last) / 1000);
      var dt = Math.min(realDt, 0.1); last = now;
      var t = (now - t0) / 1000;

      // morph: melt to liquid, swap the remembered shape, then re-solidify
      var goal;
      if (S.shapeTarget !== S.shape) {
        goal = 1;
        if (S.liquid > 0.965) { S.shape = S.shapeTarget; if (S.shape === CARABINER || S.shape === ENCLOSURE) S.spinAuto = S.yaw; }
      } else goal = S.shape === LIQUID ? 1 : Math.max(S.liquidTarget, S.hold * 0.9);
      S.liquid = damp(S.liquid, goal, goal > S.liquid ? 2.6 : 1.9, dt);
      if (S.shape === LIQUID) S.liquid = 1;

      S.mat = damp(S.mat, S.matTarget, 3, dt);
      var sh = alignShift();
      S.shiftX = damp(S.shiftX, sh[0], 2.4, dt);
      S.shiftY = damp(S.shiftY, sh[1], 2.4, dt);
      // narrow (portrait) screens: pull the camera back so the object fits the width
      S.focal = damp(S.focal, S.focalTarget * clamp(aspect / 0.85, 0.52, 1), 2.4, dt);

      wellA = damp(wellA, wellAT, 4, dt);
      if (P.has) { var w = worldOnZ0(P.x, P.y); well[0] = lerp(well[0], w[0], 0.06); well[1] = lerp(well[1], w[1], 0.06); }
      var wl = Math.hypot(well[0], well[1]), wmax = 2.9;
      var wx = wl > wmax ? well[0] * wmax / wl : well[0], wy = wl > wmax ? well[1] * wmax / wl : well[1];
      if (rip.t < 5) rip.t += dt;

      simulate(dt, REDUCED ? 0 : t, now);
      var ap = armPoints();

      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uTime, REDUCED ? 8.0 + t * 0.15 : t);
      gl.uniform2f(U.uWell, wx, wy);
      gl.uniform1f(U.uWellA, wellA * (REDUCED ? 0 : 1));
      gl.uniform1f(U.uRipT, REDUCED ? 99 : rip.t);
      gl.uniform2f(U.uRipP, rip.x, rip.y);
      gl.uniform1f(U.uMat, S.mat);
      gl.uniform1i(U.uShape, S.shape);
      gl.uniform1f(U.uLiquid, S.liquid);
      gl.uniform2f(U.uShift, S.shiftX, S.shiftY);
      gl.uniform1f(U.uFocal, S.focal);
      gl.uniform1f(U.uBound, S.liquid > 0.02 ? 3.6 : 1.9);
      rotBuf.set(Rm);
      gl.uniformMatrix3fv(U.uRot, true, rotBuf);
      gl.uniform1f(U.uGate, S.gate);
      gl.uniform1f(U.uGrip, S.grip);
      gl.uniform3f(U.uS, ARM_S[0], ARM_S[1], 0);
      gl.uniform3fv(U.uE, ap[0]); gl.uniform3fv(U.uW, ap[1]); gl.uniform3fv(U.uT, ap[2]);
      gl.uniform3f(U.uCnc, S.cnc[0], S.cnc[1], S.cnc[2]);
      gl.uniform1f(U.uSpin, S.spin);
      gl.uniform1f(U.uOpen, S.open);
      gl.uniform3fv(U.uAccent, ACCENTS[S.shape]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawn++;

      // fps + adaptive resolution (only ever steps down)
      frames++; acc += realDt;
      if (acc > 0.5) {
        fps = Math.round(frames / acc); frames = 0; acc = 0;
        var floor = fps < 20 ? 0.3 : 0.4;
        if (fps < 42 && scale > floor) { lowFor++; if (lowFor >= 2) { scale = Math.max(floor, scale - 0.1); resize(); lowFor = 0; } }
        else lowFor = 0;
      }
      if (opts.onFrame) {
        var c = center();
        opts.onFrame({
          shape: S.shape, target: S.shapeTarget, liquid: S.liquid, fps: fps, scale: scale,
          cx: c[0], cy: c[1], r: radiusPx(), yaw: S.yaw, pitch: S.pitch,
          gate: S.gate, grip: S.grip, open: S.open, gcode: gcode, th: S.th, hold: S.hold,
          near: P.has && nearObject(P.x, P.y)
        });
      }
      schedule();
    }

    function fail(why) {
      self.ok = false;
      if (S) S.paused = true;
      if (opts.onFail) opts.onFail(why);
      self.setForm = self.setMaterial = self.setAlign = self.setFocal = self.pause = function () {};
      self.isNear = function () { return false; };
    }

    this.ok = true;
    schedule();

    // headless / blocklisted-GPU guard: a correct frame is never uniformly black.
    // Only judge once frames have actually been drawn (a background tab draws none).
    var drawn = 0;
    function blackCheck() {
      if (drawn < 20) { setTimeout(blackCheck, 500); return; }
      try {
        var sum = 0, px = new Uint8Array(4);
        [[0.5, 0.5], [0.4, 0.45], [0.6, 0.55], [0.5, 0.35], [0.45, 0.6], [0.55, 0.42], [0.2, 0.8], [0.8, 0.2]].forEach(function (f) {
          gl.readPixels(Math.floor(W * f[0]), Math.floor(H * f[1]), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          sum += px[0] + px[1] + px[2];
        });
        if (sum < 12) fail("black frame");
      } catch (e) { }
    }
    setTimeout(blackCheck, 1400);
  }

  MetalField.LIQUID = LIQUID; MetalField.CARABINER = CARABINER; MetalField.ARM = ARM; MetalField.CNC = CNC; MetalField.ENCLOSURE = ENCLOSURE;
  window.MetalField = MetalField;
})();
