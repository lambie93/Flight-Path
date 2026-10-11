(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const first = (...ids) => ids.map($).find(Boolean) || null;
  const fromInput = $('from');
  const toInput = $('to');
  const result = $('result');
  const airportList = $('airports');
  const passengersInput = first('passengers', 'pax');
  const roundInput = $('round');
  const nonCo2Input = first('nonco2', 'rf');
  const equalsList = first('equals', 'eq');
  const moreSection = $('more');
  const cabinsSection = $('cabins');
  const bars = $('bars');
  let airports = [];
  let byCode = new Map();

  if (result) result.hidden = true;
  if (moreSection) moreSection.hidden = true;
  if (cabinsSection) cabinsSection.hidden = true;

  function hideResults() {
    if (result) {
      result.replaceChildren();
      result.hidden = true;
    }
    if (moreSection) moreSection.hidden = true;
    if (cabinsSection) cabinsSection.hidden = true;
  }

  function showMessage(message) {
    if (result) {
      result.replaceChildren();
      const box = document.createElement('div');
      box.className = 'empty';
      box.textContent = message;
      result.appendChild(box);
      result.hidden = false;
    }
    if (moreSection) moreSection.hidden = true;
    if (cabinsSection) cabinsSection.hidden = true;
  }

  function valueOf(obj, names) {
    for (const name of names) {
      const value = obj && obj[name];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  }

  function normalizeAirport(raw) {
    if (Array.isArray(raw)) {
      // Also accept compact rows: [IATA, name, city, country, latitude, longitude].
      if (raw.length >= 6) {
        return { code: String(raw[0] || '').trim().toUpperCase(), name: String(raw[1] || ''), city: String(raw[2] || ''), country: String(raw[3] || ''), lat: Number(raw[4]), lon: Number(raw[5]) };
      }
      return null;
    }
    if (!raw || typeof raw !== 'object') return null;
    const code = String(valueOf(raw, ['iata', 'iata_code', 'iataCode', 'code', 'airport_code', 'airportCode']) || '').trim().toUpperCase();
    const lat = Number(valueOf(raw, ['lat', 'latitude', 'latitude_deg']));
    const lon = Number(valueOf(raw, ['lon', 'lng', 'longitude', 'longitude_deg']));
    return {
      code,
      name: String(valueOf(raw, ['name', 'airport_name', 'airportName', 'airport', 'ident']) || ''),
      city: String(valueOf(raw, ['city', 'municipality', 'town', 'locality']) || ''),
      country: String(valueOf(raw, ['country', 'country_name', 'countryName', 'iso_country', 'country_code']) || ''),
      lat, lon
    };
  }

  function extractRows(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    for (const key of ['airports', 'data', 'results', 'items']) {
      if (Array.isArray(data[key])) return data[key];
    }

    return Object.entries(data).map(([key, val]) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) return { code: key, ...val };
      return val;
    });
  }

  function airportLabel(a) {
    const parts = [a.code];
    if (a.city) parts.push(a.city);
    if (a.name && a.name.toLowerCase() !== a.city.toLowerCase()) parts.push(a.name);
    return parts.filter(Boolean).join(' – ');
  }

  function renderAirportOptions() {
    if (!airportList) return;
    airportList.replaceChildren();
    const fragment = document.createDocumentFragment();
    airports.forEach((airport) => {
      const option = document.createElement('option');
      option.value = airportLabel(airport);
      fragment.appendChild(option);
    });
    airportList.appendChild(fragment);
  }

  function findAirport(text) {
    const query = String(text || '').trim();
    if (!query) return null;
    const upper = query.toUpperCase();
    const possibleCode = upper.match(/^([A-Z0-9]{3})\b/);
    if (possibleCode && byCode.has(possibleCode[1])) return byCode.get(possibleCode[1]);
    const q = query.toLocaleLowerCase();
    return airports.find((a) => airportLabel(a).toLocaleLowerCase() === q)
      || airports.find((a) => a.name.toLocaleLowerCase() === q)
      || airports.find((a) => a.city.toLocaleLowerCase() === q)
      || airports.find((a) => (a.city + ' ' + a.name + ' ' + a.country).toLocaleLowerCase().includes(q))
      || null;
  }

  function haversine(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  const CABINS = [
    { value: 'economy', label: 'Economy' },
    { value: 'premium', label: 'Premium economy' },
    { value: 'business', label: 'Business' },
    { value: 'first', label: 'First' }
  ];
  function selectedCabin() {
    return document.querySelector('input[name="cabin"]:checked')?.value || 'economy';
  }
  function multiplier(cabin, longHaul) {
    if (cabin === 'economy') return 1;
    if (cabin === 'premium') return longHaul ? 1.6 : 1.3;
    if (cabin === 'business') return longHaul ? 2.9 : 1.5;
    return longHaul ? 4 : 1.5;
  }
  function perPerson(distanceKm, cabin, includeNonCo2, roundTrip) {
    const adjustedDistance = distanceKm * 1.08;
    const base = 15 + 0.065 * adjustedDistance;
    return base * multiplier(cabin, adjustedDistance > 3700) * (includeNonCo2 ? 1.9 : 1) * (roundTrip ? 2 : 1);
  }
  function fmtKg(kg) {
    return kg >= 1000 ? (kg / 1000).toFixed(2) + ' t' : Math.round(kg).toLocaleString() + ' kg';
  }
  function number(n) { return Math.round(n).toLocaleString(); }
  function textElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    return el;
  }

  function makeTicket(a, b, distance, cabin, roundTrip, total, per, pax) {
    const pass = document.createElement('article');
    pass.className = 'pass';
    const main = document.createElement('div');
    main.className = 'pass-main';
    const legs = document.createElement('div');
    legs.className = 'legs';

    function airportBlock(airport, right) {
      const block = document.createElement('div');
      if (right) block.style.textAlign = 'right';
      block.append(textElement('div', 'code', airport.code));
      const location = textElement('div', 'where', [airport.city, airport.country].filter(Boolean).join('\n'));
      block.append(location);
      return block;
    }

    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arc.setAttribute('class', 'arc');
    arc.setAttribute('viewBox', '0 0 300 64');
    arc.setAttribute('preserveAspectRatio', 'none');
    arc.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M10 52 Q150 -22 290 52');
    const dot1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot1.setAttribute('class', 'dot'); dot1.setAttribute('cx', '10'); dot1.setAttribute('cy', '52'); dot1.setAttribute('r', '5');
    const dot2 = dot1.cloneNode(); dot2.setAttribute('cx', '290');
    const plane = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    plane.setAttribute('class', 'plane');
    plane.setAttribute('transform', 'translate(150 15) rotate(90)');
    plane.setAttribute('d', 'M0 -9 L3 -2 L10 3 L10 5 L3 3 L2 8 L5 10 L5 11 L0 10 L-5 11 L-5 10 L-2 8 L-3 3 L-10 5 L-10 3 L-3 -2 Z');
    arc.append(path, dot1, dot2, plane);
    legs.append(airportBlock(a, false), arc, airportBlock(b, true));

    const meta = document.createElement('div'); meta.className = 'meta';
    const cabinLabel = CABINS.find((c) => c.value === cabin)?.label || 'Economy';
    [number(distance) + ' km (' + number(distance * 0.621371) + ' mi)', cabinLabel, roundTrip ? 'Round Trip' : 'One Way'].forEach((label) => {
      const span = document.createElement('span'); span.append(textElement('b', '', label)); meta.appendChild(span);
    });
    main.append(legs, meta);

    const stub = document.createElement('div'); stub.className = 'pass-stub';
    stub.appendChild(textElement('p', 'stub-lbl', 'CO₂ for this trip'));
    const big = document.createElement('div'); big.className = 'big';
    const parts = fmtKg(total).split(' ');
    big.append(textElement('span', 'n', parts[0]), textElement('span', 'u', parts.slice(1).join(' ')));
    stub.append(big, textElement('p', 'stub-sub', pax > 1 ? fmtKg(per) + ' each for ' + pax + ' passengers' : 'for one passenger'));
    pass.append(main, stub);
    requestAnimationFrame(() => {
      const currentStub = pass.querySelector('.pass-stub');
      if (currentStub) pass.style.setProperty('--stub-h', currentStub.offsetHeight + 'px');
    });
    return pass;
  }

  function update() {
    if (!fromInput || !toInput || !result) return;
    const a = findAirport(fromInput.value);
    const b = findAirport(toInput.value);
    if (!a || !b) {
      showMessage('Choose two valid airports. Start typing an airport code (such as JFK) or choose an airport from the suggestions.');
      return;
    }
    if (a.code === b.code) {
      showMessage('The origin and destination are the same airport. Choose a different destination.');
      return;
    }
    if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) {
      showMessage('The selected airport is missing latitude or longitude in airports.json.');
      return;
    }

    const cabin = selectedCabin();
    const paxRaw = Number.parseInt(passengersInput?.value || '1', 10);
    const pax = Math.max(1, Math.min(20, Number.isFinite(paxRaw) ? paxRaw : 1));
    const roundTrip = Boolean(roundInput?.checked);
    const includeNonCo2 = Boolean(nonCo2Input?.checked);
    const distance = haversine(a, b);
    const per = perPerson(distance, cabin, includeNonCo2, roundTrip);
    const total = per * pax;

    result.replaceChildren(makeTicket(a, b, distance, cabin, roundTrip, total, per, pax));
    result.hidden = false;
    if (moreSection) moreSection.hidden = false;

    if (equalsList) {
      const carKm = total / 0.25;
      const treeYears = total / 21;
      const worldShare = total / 4700 * 100;
      equalsList.replaceChildren();
      const comparisons = [
        [number(carKm) + ' km (' + number(carKm * 0.621371) + ' miles)', 'of driving in an average U.S. passenger car.'],
        [(treeYears < 10 ? treeYears.toFixed(1) : number(treeYears)) + ' years', 'of CO₂ absorbed by one mature tree.'],
        [(worldShare < 10 ? worldShare.toFixed(1) : number(worldShare)) + '%', 'of what the average person in the world emits in a year.']
      ];
      comparisons.forEach(([heading, description]) => {
        const row = document.createElement('div');
        const headingText = textElement('dt', '', heading);
        const descriptionText = textElement('dd', '', description);

        row.style.display = 'block';
        headingText.style.display = 'inline';
        headingText.style.margin = '0 0.3em 0 0';
        descriptionText.style.display = 'inline';
        descriptionText.style.margin = '0';
        row.append(headingText, descriptionText);
        equalsList.appendChild(row);
      });
    }

    if (cabinsSection && bars) {
      const vals = CABINS.map((c) => ({ cabin: c, value: perPerson(distance, c.value, includeNonCo2, roundTrip) }));
      const max = Math.max(...vals.map((v) => v.value), 1);
      bars.replaceChildren();
      vals.forEach(({ cabin: c, value }) => {
        const row = document.createElement('div');
        row.className = 'bar' + (c.value === cabin ? ' on' : '');
        row.appendChild(textElement('span', 'name', c.label));
        const track = document.createElement('div'); track.className = 'track';
        const fill = document.createElement('div'); fill.className = 'fill'; fill.style.width = (value / max * 100) + '%';
        track.appendChild(fill);
        row.append(track, textElement('span', 'val', fmtKg(value)));
        bars.appendChild(row);
      });
      cabinsSection.hidden = false;
    }
  }

  function wireEvents() {

    [fromInput, toInput, passengersInput, roundInput, nonCo2Input].filter(Boolean).forEach((el) => {
      el.addEventListener('input', hideResults);
      el.addEventListener('change', hideResults);
    });
    document.querySelectorAll('input[name="cabin"]').forEach((el) => {
      el.addEventListener('change', hideResults);
    });

    const swap = $('swap');
    if (swap) swap.addEventListener('click', () => {
      if (!fromInput || !toInput) return;
      const old = fromInput.value;
      fromInput.value = toInput.value;
      toInput.value = old;
      hideResults();
    });

    const enter = first('enter', 'calculate');
    if (enter) enter.addEventListener('click', update);

    window.addEventListener('resize', () => {
      const ticket = document.querySelector('.pass');
      const stub = ticket && ticket.querySelector('.pass-stub');
      if (ticket && stub) ticket.style.setProperty('--stub-h', stub.offsetHeight + 'px');
    });
  }

  async function init() {
    if (!fromInput || !toInput || !result) {
      console.error('Flightprint: required HTML element missing. Expected #from, #to, and #result.');
      return;
    }
    hideResults();
    try {
      const response = await fetch('./airports.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load airports.json (HTTP ' + response.status + ').');
      const data = await response.json();
      airports = extractRows(data).map(normalizeAirport).filter((a) => a && /^[A-Z0-9]{3}$/.test(a.code) && Number.isFinite(a.lat) && Number.isFinite(a.lon));

      byCode = new Map();
      airports = airports.filter((a) => {
        if (byCode.has(a.code)) return false;
        byCode.set(a.code, a);
        return true;
      });
      if (!airports.length) throw new Error('airports.json loaded, but no airports with a 3-character IATA code and valid latitude/longitude were found.');
      renderAirportOptions();
      wireEvents();
      if (!fromInput.value.trim()) fromInput.value = byCode.has('JFK') ? airportLabel(byCode.get('JFK')) : airportLabel(airports[0]);
      if (!toInput.value.trim()) {
        const destination = byCode.get('LAX') || airports.find((a) => a.code !== findAirport(fromInput.value)?.code) || airports[0];
        toInput.value = airportLabel(destination);
      }

    } catch (error) {
      console.error('Flightprint airport data error:', error);

    }
  }

  init();
})();