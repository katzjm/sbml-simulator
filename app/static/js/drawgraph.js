(function() {
	"use strict";

	window.addEventListener("load", main);

	let nodes;
	let edges;
	let network;

	function checkStatus(response) {
		if (response.status >= 200 && response.status < 300) {
			return response.text();
		} else {
			return response.text().then(Promise.reject.bind(Promise));
		}
	}

	function handleGraphJSON(json){
		// console.log(json);
		// nodes = [
		// 	{id: 1,  value: 2,  label: 'Algie' },
		// 	{id: 2,  value: 31, label: 'Alston'},
		// 	{id: 3,  value: 12, label: 'Barney'},
		// 	{id: 4,  value: 16, label: 'Coley' },
		// 	{id: 5,  value: 17, label: 'Grant' },
		// 	{id: 6,  value: 15, label: 'Langdon'},
		// 	{id: 7,  value: 6,  label: 'Lee'},
		// 	{id: 8,  value: 5,  label: 'Merlin'},
		// 	{id: 9,  value: 30, label: 'Mick'},
		// 	{id: 10, value: 18, label: 'Tod'},
		// ];

		// edges = [
		// 	{from: 2, to: 8, value: 3, title: '3 emails per week'},
		// 	{from: 2, to: 9, value: 5, title: '5 emails per week'},
		// 	{from: 2, to: 10,value: 1, title: '1 emails per week'},
		// 	{from: 4, to: 6, value: 8, title: '8 emails per week'},
		// 	{from: 5, to: 7, value: 2, title: '2 emails per week'},
		// 	{from: 4, to: 5, value: 1, title: '1 emails per week'},
		// 	{from: 9, to: 10,value: 2, title: '2 emails per week'},
		// 	{from: 2, to: 3, value: 6, title: '6 emails per week'},
		// 	{from: 3, to: 9, value: 4, title: '4 emails per week'},
		// 	{from: 5, to: 3, value: 1, title: '1 emails per week'},
		// 	{from: 2, to: 7, value: 4, title: '4 emails per week'}
		// ];

  //     // Instantiate our network object.
		// var container = document.getElementById('network');
		// var data = {
		// 	nodes: nodes,
		// 	edges: edges
		// };
		// var options = {
		// 	nodes: {
		// 		shape: 'dot',
		// 		scaling:{
		// 			label: {
		// 				min:8,
		// 				max:20
		// 			}
		// 		}
		// 	}
		// };
		// network = new vis.Network(container, data, options);

		nodes = json['nodes']
		edges = json['edges']
		console.log(nodes)
		console.log(edges)

      // Instantiate our network object.
		var container = document.getElementById('network');
		var data = {
			nodes: nodes,
			edges: edges
		};
		var options = {
			nodes: {
				shape: 'dot',
				scaling:{
					label: {
						min:8,
						max:20
					}
				}
			}
		};
		network = new vis.Network(container, data, options);
	}

	function main() {
		let form = document.getElementById('file-form');
		let fileSelect = document.getElementById('file-select');
		let uploadButton = document.getElementById('upload-button');
		let graphSpec;

		form.addEventListener("submit", function(e) {
			e.preventDefault();
			uploadButton.innerHTML = 'Uploading...';

			let formData = new FormData();
			formData.append('sbml', fileSelect.files[0], 'sbml.xml');
			const init = {
				method: "POST",
				body: formData,
			};

			fetch("upload", init)
				.then(checkStatus)
				.then(JSON.parse)
				.then(handleGraphJSON)
				.catch(console.log);

			uploadButton.innerHTML = 'Upload';
		});
	}
})();