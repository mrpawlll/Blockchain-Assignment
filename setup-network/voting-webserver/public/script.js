// Cast a vote
document.getElementById('vote-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const certificateId = document.getElementById('voteCertificateId').value;
    const candidateId = document.getElementById('candidateId').value;

    const response = await fetch('http://localhost:3000/vote', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ certificateId, candidateId })
    });

    const result = await response.text();
    alert(result);
});

// Query users
document.getElementById('query-users').addEventListener('click', async () => {
    const response = await fetch('http://localhost:3000/users');
    const result = await response.json();
    const userList = document.getElementById('user-list');
    userList.innerHTML = result;
});

document.getElementById('query-candidates').addEventListener('click', async () => {
    const candidatesContainer = document.getElementById('candidatesContainer');

    try {
        // Fetch data from the `/candidates` endpoint
        const response = await fetch('/candidates');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const candidates = await response.json();

        // Clear the container
        candidatesContainer.innerHTML = '';

        // Create a table to display the data
        const table = document.createElement('table');

        // Add a table header
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th>Candidate ID</th>
            <th>Name</th>
            <th>Votes</th>
        `;
        table.appendChild(headerRow);

        // Add table rows for each candidate
        candidates.forEach(candidate => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${candidate.candidateId}</td>
                <td>${candidate.name}</td>
                <td>${candidate.votes}</td>
            `;
            table.appendChild(row);
        });

        // Append the table to the container
        candidatesContainer.appendChild(table);
    } catch (error) {
        candidatesContainer.innerHTML = `<p style="color:red;">Failed to load candidates: ${error.message}</p>`;
    }
});
