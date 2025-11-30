import { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const svgRef = useRef(null);
  const particlesGroupRef = useRef(null);
  const [running, setRunning] = useState(false);

  // user-controlled parameters
  const [flowRate, setFlowRate] = useState(5);     // particles/sec (blood flow)
  const [pressure, setPressure] = useState(0.3);   // fraction of path per sec (blood pressure / velocity)
  const [oxygenation, setOxygenation] = useState(100); // % SaO2 (88–100)

  // air bubble alarm state
  const [airBubbleAlarm, setAirBubbleAlarm] = useState(false);

  // particles: all particles (main + decorative + arterial + bubble)
  const particlesRef = useRef([]);
  const lastTimeRef = useRef(null);

  // separate accumulators so all venous lines have same spawn rate
  const createCirclesMainAccRef = useRef(0);   // venousLine1 (real flow)
  const createCirclesDecorAccRef = useRef(0);  // venousLine2 & 3 (visual only)

  const rafRef = useRef(null);

  // map oxygenation 88–100% to dark → bright red
  function getArterialColorFromOxygenation(o2) {
    const minO2 = 88;
    const maxO2 = 100;
    const t = Math.min(
      1,
      Math.max(0, (o2 - minO2) / (maxO2 - minO2))
    ); // 0 at 88%, 1 at 100%

    // dark red ~ rgb(120, 0, 0), bright red ~ rgb(255, 0, 0)
    const r = Math.round(120 + (255 - 120) * t);
    return `rgb(${r}, 0, 0)`;
  }

  useEffect(() => {
    if (!running) return;

    const svg = svgRef.current;
    const particlesGroup = particlesGroupRef.current;
    if (!svg || !particlesGroup) return;

    const venousLine1Path = svg.getElementById("venousLine1");
    const venousLine2Path = svg.getElementById("venousLine2");
    const venousLine3Path = svg.getElementById("venousLine3");
    const arterialLinePath = svg.getElementById("arterialLine");
    const bubbleSensorRect = svg.getElementById("bubbleSensor");
    if (
      !venousLine1Path ||
      !venousLine2Path ||
      !venousLine3Path ||
      !arterialLinePath ||
      !bubbleSensorRect
    )
      return;

    const venousLine1Len = venousLine1Path.getTotalLength();
    const venousLine2Len = venousLine2Path.getTotalLength();
    const venousLine3Len = venousLine3Path.getTotalLength();
    const arterialLineLen = arterialLinePath.getTotalLength();

    // bubble sensor position (center of its rect)
    const sensorX =
      parseFloat(bubbleSensorRect.getAttribute("x")) +
      parseFloat(bubbleSensorRect.getAttribute("width")) / 2;
    const sensorY =
      parseFloat(bubbleSensorRect.getAttribute("y")) +
      parseFloat(bubbleSensorRect.getAttribute("height")) / 2;
    const sensorRadius = 3; // hit radius around sensor

    // use current slider values
    const createCirclesRateMain = flowRate;        // blood flow rate
    const createCirclesRateDecor = flowRate;       // same rate for decorative lines
    const speed = pressure;                        // blood pressure → particle speed
    const arterialColor = getArterialColorFromOxygenation(oxygenation);

    // --- SPAWN FUNCTIONS ---

    // Real venous line (feeds oxygenator / arterial)
    function createCirclesBlueMain() {
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      circle.setAttribute("r", 3);
      circle.setAttribute("fill", "blue");
      particlesGroup.appendChild(circle);

      particlesRef.current.push({
        elem: circle,
        segment: "venousMain1", // special type: real venous
        t: 0,
        isBubble: false,
      });
    }

    // Decorative venous line 2 (visual only)
    function createCirclesBlueDecorative2() {
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      circle.setAttribute("r", 3);
      circle.setAttribute("fill", "blue");
      particlesGroup.appendChild(circle);

      particlesRef.current.push({
        elem: circle,
        segment: "venousDecor2",
        t: 0,
        isBubble: false,
      });
    }

    // Decorative venous line 3 (visual only)
    function createCirclesBlueDecorative3() {
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      circle.setAttribute("r", 3);
      circle.setAttribute("fill", "blue");
      particlesGroup.appendChild(circle);

      particlesRef.current.push({
        elem: circle,
        segment: "venousDecor3",
        t: 0,
        isBubble: false,
      });
    }

    // --- UPDATE FUNCTION ---

    function updateParticles(dt) {
      const arr = particlesRef.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.t += speed * dt;

        // transitions for the REAL venous + arterial
        if (p.segment === "venousMain1" && p.t >= 1) {
          // venousLine1 finished -> go to arterial
          p.segment = "arterialLine";
          p.t = 0;

          if (p.isBubble) {
            // keep bubble white
            p.elem.setAttribute("fill", "white");
          } else {
            // normal arterial blood uses oxygenation-dependent color
            p.elem.setAttribute("fill", arterialColor);
          }
        } else if (p.segment === "arterialLine" && p.t >= 1) {
          // arterial finished -> remove
          p.elem.remove();
          arr.splice(i, 1);
          continue;
        }

        // decorative venous: just vanish at end, no arterial delivery
        if (
          (p.segment === "venousDecor2" || p.segment === "venousDecor3") &&
          p.t >= 1
        ) {
          p.elem.remove();
          arr.splice(i, 1);
          continue;
        }

        // choose correct path and length
        let path, len;
        if (p.segment === "venousMain1") {
          path = venousLine1Path;
          len = venousLine1Len;
        } else if (p.segment === "venousDecor2") {
          path = venousLine2Path;
          len = venousLine2Len;
        } else if (p.segment === "venousDecor3") {
          path = venousLine3Path;
          len = venousLine3Len;
        } else {
          // arterial
          path = arterialLinePath;
          len = arterialLineLen;
        }

        const pt = path.getPointAtLength(p.t * len);
        p.elem.setAttribute("cx", pt.x);
        p.elem.setAttribute("cy", pt.y);

        // bubble detection: if this particle is a bubble on the arterial line
        if (p.isBubble && p.segment === "arterialLine") {
          const dx = pt.x - sensorX;
          const dy = pt.y - sensorY;
          const dist2 = dx * dx + dy * dy;
          if (dist2 <= sensorRadius * sensorRadius) {
            setAirBubbleAlarm(true);
          }
        }
      }
    }

    // --- MAIN LOOP ---

    function loop(timestamp) {
      if (!running) return;

      if (lastTimeRef.current == null) lastTimeRef.current = timestamp;
      const dt = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      // spawn real venous particles on line 1
      createCirclesMainAccRef.current += createCirclesRateMain * dt;
      while (createCirclesMainAccRef.current >= 1) {
        createCirclesMainAccRef.current -= 1;
        createCirclesBlueMain();
      }

      // spawn decorative venous particles on lines 2 & 3
      createCirclesDecorAccRef.current += createCirclesRateDecor * dt;
      while (createCirclesDecorAccRef.current >= 1) {
        createCirclesDecorAccRef.current -= 1;
        createCirclesBlueDecorative2();
        createCirclesBlueDecorative3();
      }

      updateParticles(dt);
      rafRef.current = requestAnimationFrame(loop);
    }

    // reset state on (re)start
    lastTimeRef.current = null;
    createCirclesMainAccRef.current = 0;
    createCirclesDecorAccRef.current = 0;
    particlesRef.current = [];
    particlesGroup.innerHTML = "";

    // start animation
    rafRef.current = requestAnimationFrame(loop);

    // cleanup when stopping or when sliders change
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      particlesRef.current.forEach((p) => p.elem.remove());
      particlesRef.current = [];
      if (particlesGroupRef.current) {
        particlesGroupRef.current.innerHTML = "";
      }
    };
  }, [running, flowRate, pressure, oxygenation]);

  // create a single air bubble on venous main line that will travel into arterial
  const simulateAirBubble = () => {
    if (!running) return; // only simulate while running
    const svg = svgRef.current;
    const particlesGroup = particlesGroupRef.current;
    if (!svg || !particlesGroup) return;
    const venousLine1Path = svg.getElementById("venousLine1");
    if (!venousLine1Path) return;

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("r", 4);
    circle.setAttribute("fill", "white");
    particlesGroup.appendChild(circle);

    // place it at the start of venous line 1
    particlesRef.current.push({
      elem: circle,
      segment: "venousMain1",
      t: 0,
      isBubble: true,
    });

    // reset alarm so this bubble can trigger it
    setAirBubbleAlarm(false);
  };

  return (
    <div className="app">
      {/* Left container for the SVG */}
      <div className="svg-container">
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 338.66666 211.66667"
          version="1.1"
          id="svg1"
          xmlSpace="preserve"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          ref={svgRef}
          className="circuit-svg"
        >
          <defs id="defs1">
            <rect
              x="670.89792"
              y="50.8256"
              width="313.66656"
              height="49.37344"
              id="rect7"
            />
            <rect
              x="713.01056"
              y="120.52928"
              width="65.347199"
              height="87.1296"
              id="rect6"
            />
            <rect
              x="713.01056"
              y="120.52928"
              width="65.347198"
              height="87.129601"
              id="rect6-6"
            />
            <rect
              x="713.01056"
              y="120.52928"
              width="79.868798"
              height="145.216"
              id="rect6-8"
            />
            <rect
              x="713.01056"
              y="120.52928"
              width="97.294719"
              height="117.62496"
              id="rect6-4"
            />
          </defs>

          {/* background image from public/HeartLungPathsWithSensors.png */}
          <g id="layer1" transform="translate(359.6488,31.018311)">
            <image
              href="/HeartLungPathsWithSensors.png"
              width="338.66666"
              height="211.66667"
              preserveAspectRatio="none"
              x="-359.6488"
              y="-31.018311"
            />
          </g>

          <g id="layer2">
            <rect
              style={{ opacity: 0, fill: "#000000", strokeWidth: 0.264583 }}
              id="rect1"
              width="338.7883"
              height="211.64081"
              x="0.54336536"
              y="0.54336536"
            />
            <path
              style={{
                fill: "none",
                strokeWidth: 2,
                fillRule: "evenodd",
                stroke: "#3e30c0",
                strokeOpacity: 1,
                strokeDasharray: "none",
              }}
              d="m 85.308362,59.226825 9.23721,5.977019 119.268698,0.271683 -0.54337,108.129703 -2.44514,13.31245 8.69385,9.5089 7.87879,-10.59563 -2.17346,-14.94254 -0.27168,-31.5152 31.24351,-0.27168 0.54336,-51.619708 v 0"
              id="venousLine1"
            />
            <path
              style={{
                fill: "none",
                fillRule: "evenodd",
                stroke: "#3e30c0",
                strokeWidth: 2,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
              d="m 82.048169,68.735717 3.260193,11.410675 16.029278,15.757593 h 23.36471 l -0.54337,74.441055 -2.44514,15.21423 8.15048,10.05226 8.42216,-9.50889 -2.71682,-14.67087 0.27168,-75.799467 67.64899,-0.271682 0.54336,30.971829 9.5089,4.6186 -1.6301,-0.81505"
              id="venousLine2"
            />
            <path
              style={{
                fill: "none",
                fillRule: "evenodd",
                stroke: "#3e30c0",
                strokeWidth: 2,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
              d="m 86.938457,66.83394 1.086731,7.335432 16.300962,17.11601 52.70644,0.271682 -0.81505,80.418076 -1.08673,13.85581 7.33543,9.23721 7.8788,-8.69384 -1.6301,-13.85582 0.81505,-81.504803 37.22053,0.271685 1.35841,32.058558 5.43366,2.98851"
              id="venousLine3"
            />
            <path
              style={{
                fill: "none",
                fillRule: "evenodd",
                stroke: "#f81528",
                strokeWidth: 2,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
              d="m 256.46845,86.123408 -0.54337,-45.914372 -164.911383,-0.271683 -0.271682,8.150482 -5.161971,8.150479 v 0"
              id="arterialLine"
            />
            <path
              style={{
                fill: "none",
                fillRule: "evenodd",
                stroke: "#f2f518",
                strokeWidth: 2,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
              d="m 6.1474773,41.495471 -0.3842174,137.165589 -0.7684346,9.60543 5.3790427,5.37904 v 0 l 8.836998,-6.14747 -2.689521,-9.60544 1.152652,-124.870629 44.953428,-0.384217 9.98965,4.610608"
              id="salineLine"
            />
            {/* sensor / label rectangles and texts */}
            <rect
              style={{
                fill: "#ff9955",
                fillOpacity: 1,
                fillRule: "evenodd",
                stroke: "#ecaa65",
                strokeWidth: 2,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
              id="tempSensor"
              width="21.132"
              height="13.063387"
              x="224.76714"
              y="31.890039"
            />
            <rect
              style={{
                fill: "#ff80e5",
                fillOpacity: 1,
                fillRule: "evenodd",
                stroke: "#f28aef",
                strokeWidth: 2,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
              id="bubbleSensor"
              width="21.132"
              height="13.063387"
              x="106.7435"
              y="31.5214"
            />
            <text
              xmlSpace="preserve"
              transform="matrix(0.26458333,0,0,0.26458333,-78.848414,-0.1306437)"
              id="bubbleSensorText"
              style={{
                textAlign: "start",
                writingMode: "lr-tb",
                direction: "ltr",
                whiteSpace: "pre",
                shapeInside: "url(#rect6-6)",
                display: "inline",
                fill: "#1a1a1a",
                fillOpacity: 1,
                fillRule: "evenodd",
                stroke: "none",
                strokeWidth: 7.55906,
                strokeDasharray: "none",
                strokeOpacity: 1,
                fontFamily: "sans-serif",
                fontWeight: "normal",
                fontStyle: "normal",
                fontStretch: "normal",
                fontVariant: "normal",
                fontSize: 16,
              }}
            >
              <tspan x="713.00977" y="135.12658">Bubble </tspan>
              <tspan x="713.00977" y="155.12658">Sensor</tspan>
            </text>
            <rect
              style={{
                fill: "#5fd3bc",
                fillOpacity: 1,
                fillRule: "evenodd",
                stroke: "#20d2c1",
                strokeWidth: 2,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
              id="venousPressure"
              width="21.132"
              height="13.063387"
              x="107.29349"
              y="58.704479"
            />
            <text
              xmlSpace="preserve"
              transform="matrix(0.26458333,0,0,0.26458333,-79.497214,28.8102)"
              id="venousPressureText"
              style={{
                fontStyle: "normal",
                fontVariant: "normal",
                fontWeight: "normal",
                fontStretch: "normal",
                fontSize: 16,
                fontFamily: "Sans",
                textAlign: "start",
                writingMode: "lr-tb",
                direction: "ltr",
                whiteSpace: "pre",
                shapeInside: "url(#rect6-8)",
                display: "inline",
                fill: "#1a1a1a",
                fillOpacity: 1,
                fillRule: "evenodd",
                stroke: "none",
                strokeWidth: 7.55906,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
            >
              <tspan x="713.00977" y="135.12658">Venous </tspan>
              <tspan x="713.00977" y="155.12658">Pressure</tspan>
            </text>
            <text
              xmlSpace="preserve"
              transform="matrix(0.26458333,0,0,0.26458333,39.958603,2.305304)"
              id="tempSensorText"
              style={{
                textAlign: "start",
                writingMode: "lr-tb",
                direction: "ltr",
                whiteSpace: "pre",
                shapeInside: "url(#rect6)",
                display: "inline",
                fill: "#1a1a1a",
                fillOpacity: 1,
                fillRule: "evenodd",
                stroke: "none",
                strokeWidth: 7.55906,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
            >
              <tspan x="713.00977" y="135.12658">
                <tspan
                  style={{
                    fontSize: 16,
                    fontFamily: "sans-serif",
                    fontWeight: "normal",
                  }}
                >
                  Temp{" "}
                </tspan>
              </tspan>
              <tspan x="713.00977" y="155.12658">
                <tspan
                  style={{
                    fontSize: 16,
                    fontFamily: "sans-serif",
                    fontWeight: "normal",
                  }}
                >
                  Sensor
                </tspan>
              </tspan>
            </text>
            <rect
              style={{
                fill: "#ff9955",
                fillOpacity: 1,
                fillRule: "evenodd",
                stroke: "#ecaa65",
                strokeWidth: 2,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
              id="tempRegulation"
              width="21.132"
              height="13.063387"
              x="194.50922"
              y="31.049809"
            />
            <text
              xmlSpace="preserve"
              transform="matrix(0.26458333,0,0,0.26458333,6.064464,-0.3952263)"
              id="tempRegulationText"
              style={{
                fontStyle: "normal",
                fontVariant: "normal",
                fontWeight: "normal",
                fontStretch: "normal",
                fontSize: 15.3333,
                fontFamily: "sans-serif",
                textAlign: "start",
                writingMode: "lr-tb",
                direction: "ltr",
                whiteSpace: "pre",
                shapeInside: "url(#rect6-4)",
                display: "inline",
                fill: "#1a1a1a",
                fillOpacity: 1,
                fillRule: "evenodd",
                stroke: "none",
                strokeWidth: 7.55906,
                strokeDasharray: "none",
                strokeOpacity: 1,
              }}
            >
              <tspan x="713.00977" y="134.51833">
                Temp{" "}
              </tspan>
              <tspan x="713.00977" y="153.68496">
                Regulation
              </tspan>
            </text>
          </g>

          {/* group where particles are added dynamically */}
          <g id="particles" ref={particlesGroupRef}></g>
        </svg>
      </div>

      {/* Right container for controls */}
      <div className="controls-container">
        <h2>Simulation Controls</h2>

        {/* Start/Stop Simulation button at the TOP of right container */}
        <div className="control-section">
          <button
            className={`start-stop-button ${running ? "stop" : "start"}`}
            onClick={() => {
              setRunning((prev) => !prev);
            }}
          >
            {running ? "Stop Simulation" : "Start Simulation"}
          </button>
        </div>

        {/* Alarms container */}
        <div className="control-section">
          <h3>Alarms</h3>
          {airBubbleAlarm ? (
            <p style={{ color: "red", fontWeight: "bold" }}>
              AIR BUBBLE DETECTED!
            </p>
          ) : (
            <p>No alarms</p>
          )}
        </div>

        {/* Parameters display */}
        <div className="control-section">
          <h3>Parameters</h3>
          <p>Blood flow rate: {flowRate.toFixed(0)} particles/sec</p>
          <p>Blood pressure (speed): {pressure.toFixed(2)} path/s</p>
          <p>Arterial oxygenation: {oxygenation.toFixed(0)}%</p>
        </div>

        {/* Controls section: sliders + bubble button */}
        <div className="control-section">
          <h3>Controls</h3>

          <label className="control-label">
            <div>Blood flow rate (particles/sec)</div>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={flowRate}
              onChange={(e) => setFlowRate(Number(e.target.value))}
            />
          </label>

          <label className="control-label">
            <div>Blood pressure (speed)</div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={pressure}
              onChange={(e) => setPressure(Number(e.target.value))}
            />
          </label>

          <label className="control-label">
            <div>Blood oxygenation (% SaO₂)</div>
            <input
              type="range"
              min="88"
              max="100"
              step="1"
              value={oxygenation}
              onChange={(e) => setOxygenation(Number(e.target.value))}
            />
          </label>

          {/* Separate bubble simulation button INSIDE Controls */}
       <label className="simulate-bubble-toggle">
  <input
    type="checkbox"
    onChange={(e) => {
      if (e.target.checked) {
        simulateAirBubble();
        // auto-untick after triggering once
        e.target.checked = false;
      }
    }}
  />
  <span>Simulate air bubble</span>
</label>

        </div>
      </div>
    </div>
  );
}

export default App;