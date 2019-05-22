(function() {
	"use strict";

	window.addEventListener("load", main);
	let graphCanvas;
	let chartCanvas;
	let gradCanvas;
	let start;
	let end;
	let stepSize;
	let steps;
	let frequency;
	let socket;
	let mode;
	let simData;

	function checkStatus(response) {
		if (response.status >= 200 && response.status < 300) {
			return response.text();
		} else {
			return response.text().then(Promise.reject.bind(Promise));
		}
	}

	function getRandomColor() {
		const characters = "0123456789ABCDEF";
		let color = "#"
		for (let i = 0; i < 6; i++) {
			color += characters[Math.floor(Math.random() * characters.length)];
		}
		return color;
	}

	function postToServer(url, responseHandler, args) {
		const formData = new FormData();
		Object.keys(args).forEach( (key) => formData.append(key, args[key]) );

		const init = {
			method: "POST",
			body: formData,
		};

		fetch(url, init)
			.then(checkStatus)
			.then(JSON.parse)
			.then(responseHandler)
			.catch(console.log);
	}

	function runSimulation(resultFunction) {
		const args = { 'start': start, 'end': end, 'steps': steps };
		postToServer('run', resultFunction, args);
	}

	class Shape {
		constructor (fillColor, edgeColor) {
			this.fillColor = fillColor;
			this.edgeColor = edgeColor;
			this.textColor = 'black';
			this.selectColor = 'green';
			this.isSelected = false;
			this.hover = false;
		}

		contains(ctx, mx, my) {
			const oldFillColor = this.fillColor;
			const oldEdgeColor = this.edgeColor;
			const oldTextColor = this.textColor;
			const oldSelectColor = this.selectColor;

			const pixelColor1 = ctx.getImageData(mx , my, 1, 1).data;
			const color = getRandomColor();
			this.fillColor = color;
			this.edgeColor = color;
			this.textColor = color;
			this.selectColor = color;
			this.draw(ctx);

			const pixelColor2 = ctx.getImageData(mx , my, 1, 1).data;
			this.fillColor = oldFillColor;
			this.edgeColor = oldEdgeColor;
			this.textColor = oldTextColor;
			this.selectColor = oldSelectColor;
			this.draw(ctx);

			for (let i = 0; i < 3; i++) {
				if (pixelColor1[i] != pixelColor2[i]) {
					return true;
				}
			}
			return false;
		}

		select() {
			this.isSelected = true;
		}

		deselect() {
			this.isSelected = false;
		}
	}

	function roundedRect(ctx, x, y, width, height, radius) {
		ctx.beginPath();
		ctx.moveTo(x, y + radius);
		ctx.lineTo(x, y + height - radius);
		ctx.arcTo(x, y + height, x + radius, y + height, radius);
		ctx.lineTo(x + width - radius, y + height);
		ctx.arcTo(x + width, y + height, x + width, y + height-radius, radius);
		ctx.lineTo(x + width, y + radius);
		ctx.arcTo(x + width, y, x + width - radius, y, radius);
		ctx.lineTo(x + radius, y);
		ctx.arcTo(x, y, x, y + radius, radius);
	}

	class Node extends Shape {
		constructor(nodeJSON) {
			super('skyblue', 'grey');
			this.id = nodeJSON['id'];
			this.centroid = nodeJSON['centroid'];
			this.width = nodeJSON['width'];
			this.height = nodeJSON['height'];
			this._value = nodeJSON['value'];

			const orderOfMagnitude = Math.pow(10, Math.floor(Math.log(this._value) / Math.LN10 + Number.EPSILON))
			this.min = orderOfMagnitude;
			this.max = orderOfMagnitude * 10;
			this.fillColor = gradCanvas.getColorAtFraction(this._value / this.max);
		}

		draw(ctx) {
			ctx.fillStyle = this.fillColor;
			ctx.strokeStyle = this.isSelected ? this.selectColor : this.edgeColor;
			ctx.fillRect(this.x, this.y, this.width, this.height);
			ctx.strokeRect(this.x, this.y, this.width, this.height);
			ctx.fillStyle = this.textColor;
			ctx.textAlign = "center";
			ctx.font = this.height / 2  + "px sans-serif";
			ctx.fillText(this.id, this.x + this.width / 2, this.y + 3 * this.height / 4, this.width);
		}

		drag(dx, dy) {
			this.x += dx;
			this.y += dy;
		}

		get x() {
			return this.centroid[0] - this.width / 2;
		}

		set x(newX) {
			this.centroid[0] = newX + this.width / 2;
		}

		get y() {
			return this.centroid[1] - this.height / 2;
		}

		set y(newY) {
			this.centroid[1] = newY + this.height / 2;
		}

		set value(newValue) {
			this._value = newValue;
			this.fillColor = gradCanvas.getColorAtFraction(Math.min(1, Math.max(0, this._value / this.max)));
		}
	}

	class Curve extends Shape {
		constructor(curveJSON) {
			super('black', 'grey');
			const bezier = curveJSON['bezier'];
			this.startx = bezier['start'][0];
			this.starty = bezier['start'][1];
			this.cp1x = bezier['cp1'][0];
			this.cp1y = bezier['cp1'][1];
			this.cp2x = bezier['cp2'][0];
			this.cp2y = bezier['cp2'][1];
			this.endx = bezier['end'][0];
			this.endy = bezier['end'][1];
			this.type = curveJSON['type'];
			this.arrow = curveJSON['arrow'];
			this.lineWidth = 1;
		}

		draw(ctx) {
			ctx.fillStyle = this.fillColor;
			ctx.strokeStyle = this.isSelected ? this.selectColor : this.edgeColor;
			ctx.lineWidth = this.lineWidth;
			ctx.beginPath();
			ctx.moveTo(this.startx, this.starty);
			ctx.bezierCurveTo(
				this.cp1x, this.cp1y,
				this.cp2x, this.cp2y,
				this.endx, this.endy
			);
			ctx.stroke();

			if (this.arrow.length !== 0) {
				const start = this.arrow[0];
				ctx.beginPath();
				ctx.moveTo(start[0], start[1]);
				for (let i = 1; i < this.arrow.length; i++) {
					const point = this.arrow[i];
					ctx.lineTo(point[0], point[1]);
				}
				ctx.fill();
			}
		}

		drag(dx, dy) {
			// this.startx += dx;
			// this.cp1x += dx;
			// this.cp2x += dx;
			// this.endx += dx;

			// this.starty += dy;
			// this.cp1y += dy;
			// this.cp2y += dy;
			// this.endy += dy;

			// this.arrow.forEach(pt => {
			// 	pt[0] += dx;
			// 	pt[1] += dy;
			// });
		}
	}

	class HyperEdge extends Shape {
		constructor(edgeJSON) {
			super('black', 'grey');
			this.id = edgeJSON['id'];
			this.rate = edgeJSON['rate'];
			if (edgeJSON.curves[0] instanceof Curve) {
				this.curves = edgeJSON['curves'];
			} else {
				this.curves = edgeJSON['curves'].map( (c) => new Curve(c) );
			}
		}

		draw(ctx) {
			this.curves.forEach( (curve) => curve.draw(ctx) );
		}

		drag(dx, dy) {
			this.curves.forEach( (curve) => curve.drag(dx, dy) );
		}

		contains(ctx, mx, my) {
			return this.curves.some( (curve) => curve.contains(ctx, mx, my) );
		}

		select() {
			super.select();
			this.curves.forEach( (curve) => curve.select() );
		}

		deselect() {
			super.deselect();
			this.curves.forEach( (curve) => curve.deselect() );
		}

		set lineWidth(newLineWidth) {
			this.curves.forEach( (curve) => curve.lineWidth = newLineWidth );
		}

		set curveEdgeColor(color) {
			this.curves.forEach( (curve) => curve.edgeColor = color );
		}

		set curveFillColor(color) {
			this.curves.forEach( (curve) => curve.fillColor = color );
		}
	}

	class Canvas {
		constructor(canvas) {
			this.canvas = canvas;
			this.ctx = canvas.getContext('2d');
		}
	}

	class ChartCanvas extends Canvas {
		constructor(canvas) {
			super(canvas);
			this.config = {
				type: 'line',
				options: {
					repsponsive: true,
					maintainAspectRation: false,
					title: {
						display: true,
						text: 'Example Chart',
					},
					tooltips: {
						mode: 'index',
						intersect: false,
					},
					scales: {
						xAxes: [{
							display: true,
							scaleLabel: {
								display: true,
								labelString: 'Time',
							}
						}],
						yAxes: [{
							display: true,
							scaleLabel: {
								display: true,
								labelString: 'Concentration',
							}
						}]
					},
					// onHover: function(e) {
					// 	var item = this.chart.getElementAtEvent(e);
					// 	if (item.length) {
					// 		console.log("onHover",item, e.type);
					// 		console.log(">data", item[0]._index, this.chart.data.datasets[0].data[item[0]._index]);
					// 	}
					// }
				}
			}
			this.chart = new Chart(this.ctx, this.config);
		}

		loadData(data) {
			simData = data;
			this.chart.data.labels = simData['time'];
		}

		pushDataPoint(newData) {
			const labels = simData ? Object.keys(simData) : [];
			if (labels.length === 0) {
				simData = {};
				Object.keys(newData).forEach( (label) => simData[label] = [newData[label]] );
			} else {
				labels.forEach( (label) => simData[label].push(newData[label]) );
			}
		}

		replot() {
			const windowStep = document.getElementById('window-steps');
			for (let config of this.chart.data.datasets) {
				const data = simData[config.label];
				if (windowStep.offsetParent !== null && document.getElementById('window').checked) {
					const windowLen = Math.max(0, data.length - windowStep.value);
					config.data = data.slice(windowLen);
					this.chart.data.labels = simData['time'].slice(windowLen);
				} else {
					config.data = data;
					this.chart.data.labels = simData['time'];
				}
			}
			this.chart.update();
		}

		plotDataset(label) {
			if (!this.chart.data.datasets.some(config => config.label == label)) {
				this.chart.data.datasets.push(this.getDatasetConfig(label, simData[label]));
				this.chart.update();
				this.show();		
			}
		}

		hideDataset(label) {
			const index = this.chart.data.datasets.findIndex((config, index, arr) => {
				return config.label == label;
			});
			if (index !== -1) {
				this.chart.data.datasets.splice(index, 1);
				this.chart.update();
			}
			if (!this.chart.data.datasets.length) {
				this.hide();
			}
		}

		hideAllDatasets() {
			this.chart.data.datasets = [];
			this.chart.update();
			this.hide();
		}

		plotAllDatasets() {
			this.chart.data.datasets = [];
			for (let label in simData) {
				this.chart.data.datasets.push(this.getDatasetConfig(label, simData[label]));
			}
			this.chart.update();
			this.show();
		}

		hide() {
			this.canvas.style.display = 'none';
		}

		show() {
			this.canvas.style.display = 'block';
		}

		getDatasetConfig(label, data) {
			const color = getRandomColor();
			return {
				label: label,
				data: data,
				backgroundColor: color,
				borderColor: color,
				fill: false,
				pointRadius: 1,
				pointHoverRadius: 5,
			};
		}

		isPlotted(label) {
			return this.chart.data.datasets.some( (config) => config.label == label );
		}
	}

	class TipCanvas extends Canvas {
		constructor(canvas) {
			super(canvas);
			this.canvas.id = 'tip';
			this.text = null;
		}

		draw() {
			this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
			this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
			const triangleLen = this.canvas.height / 10;
			this.ctx.beginPath();
			this.ctx.moveTo(0, this.canvas.height / 2);
			this.ctx.lineTo(triangleLen, this.canvas.height / 2 - triangleLen);
			this.ctx.lineTo(triangleLen, this.canvas.height / 2 + triangleLen);
			this.ctx.fill();
			roundedRect(this.ctx, triangleLen, 0, this.canvas.width - triangleLen, this.canvas.height, 10);
			this.ctx.fill();
			this.ctx.fillStyle = 'white';
			this.ctx.textAlign = 'center';
			this.ctx.font = this.canvas.height / 2 + 'px sans-serif';
			this.ctx.fillText(
				this.text,
				this.canvas.width / 2 + triangleLen,
				3 * this.canvas.height / 4,
				this.canvas.width - 2 * triangleLen
			);
		}

		show() {
			this.canvas.style.display = 'block';
		}

		hide() {
			this.canvas.style.display = 'none';
		}

		moveTo(x, y) {
			this.canvas.style.top = y + 'px';
			this.canvas.style.left = x + 'px';
		}
	}

	class GradientCanvas extends Canvas {
		constructor(canvas) {
			super(canvas);
			this.hiColor = '#F93F3F';
			this.loColor = '#01DFF7';
			this.redraw();
		}

		redraw() {
			const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
			gradient.addColorStop(0, this.hiColor);
			gradient.addColorStop(1, this.loColor);
			this.ctx.fillStyle = gradient;
			this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		}

		getColorAtFraction(fraction) {
			const color = this.ctx.getImageData(this.canvas.width / 2 , this.canvas.height * (1 - fraction), 1, 1).data;
			return 'rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',' + color[3] + ')';
		}
	}

	class GraphCanvas extends Canvas {
		constructor(canvas) {
			super(canvas);

			this.ui = document.createElement('canvas');
			this.ui.width = this.canvas.width;
			this.ui.height = this.canvas.height;
			this.uiCtx = this.ui.getContext('2d');

			this.tip = new TipCanvas(document.createElement('canvas'));
			this.canvas.parentNode.insertBefore(this.tip.canvas, this.canvas);

			this.shapes = [];
			this.drawInterval = 30;
			this.valid = false;
			this.panning = false;
			this.dragShape = null;
			this.originX = 0;
			this.originY = 0;
			this.scale = 1;
			this.selection = [];
			setInterval(() => this.draw(), this.drawInterval);

			canvas.addEventListener("mousedown", (e) => {
				e.preventDefault();
				const simpleMouse = this.getSimpleMousePos(e);
				const clickedShape = this.getContainedShape(simpleMouse.x, simpleMouse.y);																																	
				if (clickedShape) {
					this.clickShape(clickedShape, e);
					this.dragShape = clickedShape;
				}
				if (!this.dragShape) {
					this.panning = true;
				}
				const scaledMouse = this.getScaledMousePos(e);
				this.panOffsetX = scaledMouse.x;
				this.panOffsetY = scaledMouse.y;
				this.valid = false;
			}, true);

			canvas.addEventListener("mousemove", e => {
				e.preventDefault();
				const scaledMouse = this.getScaledMousePos(e);
				const dx = scaledMouse.x - this.panOffsetX;
				const dy = scaledMouse.y - this.panOffsetY;
				this.panOffsetX = scaledMouse.x;
				this.panOffsetY = scaledMouse.y;					
				if (this.panning) {
					this.ctx.translate(dx, dy);
					this.originX -= dx;
					this.originY -= dy;
				} else if (this.dragShape) {
					const args = { 'id': this.dragShape.id, 'dx': dx, 'dy': dy };
					postToServer('drag', handleLayoutJSON, args);
				} else {
					// this.tip.hide();
					// const simpleMouse = this.getSimpleMousePos(e);
					// const hoverShape = this.getContainedShape(simpleMouse.x, simpleMouse.y);
					// if (hoverShape) {
					// 	this.tip.show();
					// 	this.tip.moveTo(
					// 		hoverShape.x + hoverShape.width,
					// 		hoverShape.y - (this.tip.canvas.scrollHeight - hoverShape.height) / 2
					// 	);
					// 	this.tip.text = hoverShape.value;
					// 	this.tip.draw();
					// }																				
				}
				this.valid = false;
			}, true);

			canvas.addEventListener("mouseup", e => {
				e.preventDefault();
				this.panning = false;
				this.dragShape = null;
			}, true);

			canvas.addEventListener("mouseout", e => {
				e.preventDefault();
				this.panning = false;
				this.dragShape = null;
			}, true);

			canvas.addEventListener("wheel", e => {
				e.preventDefault();
				const mouse = this.getScaledMousePos(e);
				const zoom = 1 + e.deltaY / 240;
				this.ctx.translate(this.originX, this.originY);
				this.ctx.scale(zoom, zoom);
				this.ctx.translate(
				    -( mouse.x + this.originX - mouse.x / zoom ),
				    -( mouse.y + this.originY - mouse.y / zoom )
				);
				this.originX = mouse.x + this.originX - mouse.x / zoom;
				this.originY = mouse.y + this.originY - mouse.y / zoom;
				this.scale *= zoom;
				this.valid = false;
			}, true);
		}

		clickShape(shape, e) {
			if (document.getElementById('select').checked) {
				if (!e.shiftKey) {
					this.clearSelection();
				}																																	
				shape.isSelected ? this.deselectShape(shape) : this.selectShape(shape);
			} else if (document.getElementById('plot').checked) {
				if (!e.shiftKey) {
					chartCanvas.hideAllDatasets();
				}
				const id = shape instanceof Node ? '[' + shape.id + ']' : shape.id;																															
				chartCanvas.isPlotted(id) ? chartCanvas.hideDataset(id) : chartCanvas.plotDataset(id);
			}
			this.valid = false;
		}

		getContainedShape(mx, my) {
			this.uiCtx.setTransform(this.scale, 0, 0, this.scale, -this.originX * this.scale, -this.originY * this.scale);
			this.uiCtx.drawImage(this.canvas, 0, 0);
			return this.shapes.find( (shape) => shape.contains(this.uiCtx, mx, my) );
		}

		addShape(shape) {
			this.shapes.push(shape);
			this.valid = false;			
		}

		getSimpleMousePos(e) {
			const rect = this.canvas.getBoundingClientRect();
			return { 
				x: e.pageX - rect.x,
				y: e.pageY - rect.y
			};
		}

		getScaledMousePos(e) {
			const mouse = this.getSimpleMousePos(e);
			return { x: mouse.x / this.scale, y: mouse.y / this.scale };
		}

		getTransformedMousePos(e) {
			const mouse = this.getScaledMousePos(e);
			return { x: mouse.x + this.originX, y: mouse.y + this.originY };
		}

		clear() {
			this.shapes = [];
			this.valid = false;
		};

		draw() {
			if (!this.valid) {	
				this.ctx.clearRect(this.originX, this.originY, this.canvas.width / this.scale, this.canvas.height / this.scale);
				this.shapes.forEach( (shape) => shape.draw(this.ctx) );
				this.valid = true;
			}
		}

		selectAllShapes() {
			this.shapes.forEach( (shape) => this.selectShape(shape) );	
			this.valid = false;		
		}

		clearSelection() {
			this.selection.forEach( (shape) => shape.deselect() );
			this.selection = [];
			this.valid = false;
		}

		selectShape(shape) {
			shape.select();
			this.selection.push(shape);
			this.valid = false;
		}

		deselectShape(shape) {
			shape.deselect();
			this.selection.splice(this.selection.indexOf(shape), 1);
			this.valid = false;
		}

		setTimepoint(index) {
			this.valid = false;
			this.nodes.forEach( (node) => {
				if (simData.hasOwnProperty('[' + node.id + ']')) {
					node.value = simData['[' + node.id + ']'][index];
				} else {
					node.fillColor = 'white';
				}
			});
		}

		get hyperedges() {
			return this.shapes.filter( (shape) => shape instanceof HyperEdge );
		}

		get nodes() {
			return this.shapes.filter( (shape) => shape instanceof Node );
		}

		set lineWidth(width) {
			this.hyperedges.forEach( (hyperedge) => hyperedge.lineWidth = width );
			this.valid = false;
		}

		set nodeFillColor(color) {
			this.nodes.forEach( (node) => node.fillColor = color );
			this.valid = false;
		}

		set nodeEdgeColor(color) {
			this.nodes.forEach( (node) => node.edgeColor = color );
			this.valid = false;
		}

		set hyperedgeFillColor(color) {
			this.hyperedges.forEach( (hyperedge) => hyperedge.curveFillColor = color );
			this.valid = false;
		}

		set hyperedgeEdgeColor(color) {
			this.hyperedges.forEach( (hyperedge) => hyperedge.curveEdgeColor = color );
			this.valid = false;
		}

		set canvasHeight(newHeight) {
			this.canvas.height = newHeight;
			this.ui.height = newHeight;
			this.ctx.translate(-this.originX * this.scale, -this.originY * this.scale);
			this.ctx.scale(this.scale, this.scale);
			this.valid = false;
		}

		set canvasWidth(newWidth) {
			this.canvas.width = newWidth;
			this.ui.width = newWidth;
			this.valid = false;
		}

		set cssHeight(newHeight) {
			this.canvas.style.height = newHeight;
		}

		set cssWidth(newWidth) {
			this.canvas.style.width = newWidth;
		}

		get canvasHeight() {
			return this.canvas.height;
		}

		get canvasWidth() {
			return this.canvas.width;
		}

		get cssHeight() {
			return this.canvas.style.height;
		}

		get cssWidth() {
			return this.canvas.style.width;
		}
	}

	function startSimulation() {
		const args = { 'start': start, 'frequency': frequency, 'stepSize': stepSize };
		socket = io.connect('http://localhost:80');
		socket.on('connect', () => {
			console.log('connected!');
			socket.emit('start', args)
		});
		socket.on('response', (data) => {
			chartCanvas.pushDataPoint(data);
			chartCanvas.replot();
		});
		socket.on('error', (e) => {
			console.error("WebSocket error observed:", e);
			socket.close();
		})
	}

	function handleLayoutJSON(json){
		const layout = json['layout'];
		const nodes = layout['nodes'];
		const edges = layout['edges'];

		document.getElementById('sbml-download').style.display = 'block';
		let downloadLink = document.getElementById('sbml-download');
		downloadLink.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(json['sbml']);

		graphCanvas.clear();
		nodes.forEach( (node) => graphCanvas.addShape(new Node(node)) );
		edges.forEach( (edge) => graphCanvas.addShape(new HyperEdge(edge)) );

		const selectList = document.getElementById('select-list');
		for (let i = selectList.options.length - 1; i >= 0; i--) {
			selectList.remove(i)
		}

		graphCanvas.shapes.forEach( (shape) => {
			const option = document.createElement('option');
			option.value = shape.id;
			option.innerHTML = shape.id;
			option.addEventListener('click', (e) => graphCanvas.clickShape(shape, e) );
			selectList.appendChild(option);
		});
	}

	function handleRunOutput(json) {
		chartCanvas.loadData(json['data']);

		const paramList = document.getElementById('parameter-list');
		for (let i = paramList.options.length - 1; i >= 0; i--) {
			paramList.remove(i)
		}

		for (let param of json['params']) {
			const option = document.createElement('option');
			option.addEventListener('click', handleParamSelection);
			option.value = param;
			option.innerHTML = param;
			paramList.appendChild(option);
		}
	}

	class Slider {
		constructor(param, value) {
			this.param = param;
			this.value = Number.parseFloat(value).toPrecision(3);
			this.min = 0;
			this.max = 2 * this.value;

			this.container = document.createElement('li');
			this.valueLabel = document.createElement('label');
			this.valueOutput = document.createElement('output');
			this.sliderContainer = document.createElement('div');
			this.minInput = document.createElement('input'); 
			this.slider = document.createElement('input');
			this.maxInput = document.createElement('input');
			this.stepsLabel = document.createElement('label');
			this.stepInput = document.createElement('input');

			this.container.id = this.param;
			this.container.class = 'slider';

			this.valueLabel.innerHTML = this.param + ' = ';
			this.valueOutput.innerHTML = this.value;
			this.valueOutput.style.width = '30%';
			this.sliderContainer.style.display = 'block';

			this.minInput.value = 0;
			this.minInput.min = 0;
			this.minInput.className = 'min-input';
			this.minInput.addEventListener('change', (e) => {
				this.slider.min = this.minInput.value;
				if (this.minInput.value >= this.slider.value) {
					this.slider.value = this.minInput.value;
					this.slider.dispatchEvent(new Event('input'));
				}
				if (this.minInput.value > this.maxInput.value) {
					this.maxInput.value = this.minInput.value;
					this.maxInput.dispatchEvent(new Event('change'));
				}
			});
			this.slider.type = 'range';
			this.slider.value = this.value;
			this.slider.min = 0;
			this.slider.max = 2 * this.value;
			const precision = parseFloat(this.value).toExponential(2);
			this.slider.step = Math.pow(10, precision.substring(precision.length - 2)) / 100;
			this.slider.className = 'slider';
			this.slider.addEventListener('input', (e) => {
		 		const args = { 'param': this.param, 'value': this.slider.value };
				postToServer('set_param', () => { return null }, args);
				runSimulation( (json) => {
					chartCanvas.loadData(json['data']);
					chartCanvas.replot();
				});
				this.valueOutput.innerHTML = this.slider.value;
			});
			this.maxInput.value = 2 * this.value;
			this.maxInput.min = 0;
			this.maxInput.className = 'max-input';
			this.maxInput.addEventListener('change', (e) => {
				this.slider.max = this.maxInput.value;
				if (this.maxInput.value <= this.slider.value) {
					this.slider.value = this.maxInput.value;
					this.slider.dispatchEvent(new Event('input'));
				}
				if (this.minInput.value > this.maxInput.value) {
					this.minInput.value = this.maxInput.value;
					this.minInput.dispatchEvent(new Event('change'));
				}
			});
			this.container.appendChild(this.valueLabel);
			this.container.appendChild(this.valueOutput);
			this.container.appendChild(this.sliderContainer);
			this.sliderContainer.appendChild(this.minInput);
			this.sliderContainer.appendChild(this.slider);
			this.sliderContainer.appendChild(this.maxInput);
		}

		appendTo(element) {
			element.appendChild(this.container);
		}
	}

	function getSliderCreator(param) {
		return (value) => {
			const slider = new Slider(param, value);
			slider.appendTo(document.getElementById('sliders'));
		}
	}

	function handleParamSelection(e) {
		const param = e.target.text;
		const slider = document.getElementById(param);
		if (slider) {
			slider.parentNode.removeChild(slider);
		} else {
			const sliderCreator = getSliderCreator(param);
			postToServer('get_param', sliderCreator, { 'param': param });
		}
	}

	function uploadSBML(e) {
		e.preventDefault();
		const args = {
			'sbml': document.getElementById('file-select').files[0],
			'height': graphCanvas.canvasHeight,
			'width': graphCanvas.canvasWidth,
			'gravity': document.getElementById('gravity').value,
			'stiffness': document.getElementById('stiffness').value,
		}
		postToServer('upload', handleLayoutJSON, args);
	}

	function startOfflineSim(e) {
		e.preventDefault();
		start = document.getElementById('start-offline').value;
		end = document.getElementById('end-offline').value;
		steps = document.getElementById('step-offline').value;

		const canvasTime = document.getElementById('canvas-time');
		canvasTime.min = 0;
		canvasTime.max = steps - 1;
		canvasTime.value = 0;
		runSimulation(handleRunOutput);
	}

	function startOnlineSim(e) {
		e.preventDefault();
		console.log("another");
		start = document.getElementById('start-online').value;
		frequency = document.getElementById('frequency-online').value;
		stepSize = document.getElementById('step-online').value;
		startSimulation();
	}

	function handleRedrawButton(e) {
		e.preventDefault();
		const args = { 'height': graphCanvas.canvasHeight, 'width': graphCanvas.canvasWidth }
		postToServer('redraw', handleLayoutJSON, args);
	}

	function handleSelectAllButton() {
		if (document.getElementById('select').checked) {
			graphCanvas.selectAllShapes();
		} else if (document.getElementById('plot').checked) {
			chartCanvas.plotAllDatasets();
		}
	}

	function changeSimMode() {
		if (document.getElementById('offline').checked) {
			document.getElementById('offline-form').style.display = 'flex';
			document.getElementById('online-form').style.display = 'none';
			document.getElementById('start-menu').style.display = 'none';
		} else {
			document.getElementById('offline-form').style.display = 'none';
			document.getElementById('online-form').style.display = 'flex';
			if (document.getElementById('plot').checked) {
				document.getElementById('start-menu').style.display = 'block';
			}
		}
	}

	function main() {
		const canvasContainer = document.getElementById('canvas-container');
		const canvas = document.getElementById('canvas');
		const boundingRect = canvas.getBoundingClientRect();
		graphCanvas = new GraphCanvas(canvas);
		graphCanvas.canvasWidth = boundingRect.width;
		graphCanvas.canvasHeight = boundingRect.height;
		graphCanvas.cssWidth = boundingRect.width + 'px';
		graphCanvas.cssHeight = boundingRect.height + 'px';
		canvasContainer.style.height = boundingRect.height + 'px';
		canvasContainer.style.width = boundingRect.width + 'px';

		chartCanvas = new ChartCanvas(document.getElementById('chart'));
		chartCanvas.hide();

		document.getElementById('upload-wrapper').addEventListener("change", uploadSBML);
		document.getElementById('offline-form').addEventListener('submit', startOfflineSim);
		document.getElementById('online-form').addEventListener('submit', startOnlineSim);
		document.getElementById('redraw-form').addEventListener("submit", handleRedrawButton);
		document.getElementById('select-all').addEventListener('click', handleSelectAllButton);
		document.getElementById('sim-mode').addEventListener('change', changeSimMode);

		function rowResize(e) {
			e.preventDefault();
			graphCanvas.cssHeight = (parseInt(graphCanvas.cssHeight) + e.movementY) + 'px';
			graphCanvas.canvasHeight = parseInt(graphCanvas.canvasHeight) + e.movementY;
			canvasContainer.style.height = parseInt(canvasContainer.style.height) + e.movementY + 'px';
			for (const column of document.getElementsByClassName('column')) {
				column.style.height = (column.getBoundingClientRect().height - e.movementY) + 'px';
			};
		}

		document.getElementById('row-seperator').addEventListener('mousedown', (e) => {
			document.addEventListener('mousemove', rowResize);
		});

		document.addEventListener('mouseup', (e) => {
			document.removeEventListener('mousemove', rowResize);
		});

		const lineThicknessEditor = document.getElementById('line-thickness');
		lineThicknessEditor.addEventListener('input', (e) => {
			graphCanvas.lineWidth = lineThicknessEditor.value;
		});

		const canvasTime = document.getElementById('canvas-time');
		canvasTime.addEventListener('input', (e) => graphCanvas.setTimepoint(canvasTime.value) );

		const pickrConfig = {
		    components: {
		        preview: true,
		        opacity: true,
		        hue: true,

		        interaction: {
		            hex: true,
		            rgba: true,
		            hsla: true,
		            input: true,
		            save: true
		        }
		    }
		};

		const rePickr = Pickr.create(Object.assign({ el: '#reaction-edge' }, pickrConfig));
		const nfPickr = Pickr.create(Object.assign({ el: '#node-fill' }, pickrConfig));
		const nePickr = Pickr.create(Object.assign({ el: '#node-edge' }, pickrConfig));
		const hiPickr = Pickr.create(Object.assign({ el: '#hi-color' }, pickrConfig));
		const loPickr = Pickr.create(Object.assign({ el: '#lo-color' }, pickrConfig));

		rePickr.on('change', (hsva, _) => {
			graphCanvas.hyperedgeEdgeColor = hsva.toRGBA().toString();
		});

		nfPickr.on('change', (hsva, _) => {
			graphCanvas.nodeFillColor = hsva.toRGBA().toString();
		});

		nePickr.on('change', (hsva, _) => {
			graphCanvas.nodeEdgeColor = hsva.toRGBA().toString();
		});

		gradCanvas = new GradientCanvas(document.getElementById('gradient'));
		hiPickr.on('change', (hsva, _) => {
			gradCanvas.hiColor = hsva.toRGBA().toString();
			gradCanvas.redraw();
		});

		loPickr.on('change', (hsva, _) => {
			gradCanvas.loColor = hsva.toRGBA().toString();
			gradCanvas.redraw();
		});
	}
})();

// const x1 = 0;
// const y1 = 0;
// const bx1 = 0;
// const by1 = 125;
// const bx2 = 250;
// const by2 = 125;
// const x2 = 250;
// const y2 = 250;

// let t = 0;
// function draw() {
//   const ctx = document.getElementById('canvas').getContext('2d');
//   ctx.clearRect(0, 0, 500, 500);
  
//   ctx.strokeStyle = 'black';
//   ctx.moveTo(x1, y1);
//   ctx.bezierCurveTo(bx1, by1, bx2, by2, x2, y2);
//   ctx.stroke();
  
//   const roc = 1000;
//   const time = new Date().getTime();
//   const dt = 0.01 * (time % roc) / roc;
//   t = (t + dt) % 1;
//   console.log(t);

//   const u = 1.0 - t;
//   const qxb =  x1*u*u + bx1*2*t*u + bx2*t*t;
//   const qxd = bx1*u*u + bx2*2*t*u +  x2*t*t;
//   const qyb =  y1*u*u + by1*2*t*u + by2*t*t;
//   const qyd = by1*u*u + by2*2*t*u +  y2*t*t;
//   const xd = qxb*u + qxd*t;
//   const yd = qyb*u + qyd*t; 
  
//   ctx.beginPath();
//   ctx.fillStyle = 'green';
//   ctx.arc(xd, yd, 10, 0, 2 * Math.PI);
//   ctx.fill();
  
//   window.requestAnimationFrame(draw);
// }

// window.requestAnimationFrame(draw);