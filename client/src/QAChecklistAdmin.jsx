import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function QAChecklistAdmin() {
    const [checklist, setChecklist] = useState([]);
    const [newCriteria, setNewCriteria] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editValue, setEditValue] = useState('');

    const API_URL = 'http://localhost:3001/api/qa-checklist';

    // Fetch the checklist when the component loads
    useEffect(() => {
        fetchChecklist();
    }, []);

    const fetchChecklist = async () => {
        try {
            const response = await axios.get(API_URL);
            setChecklist(response.data);
        } catch (error) {
            console.error("Failed to fetch checklist", error);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!newCriteria.trim()) return;

        try {
            await axios.post(API_URL, { criteria: newCriteria });
            setNewCriteria('');
            fetchChecklist(); // Refresh the list
        } catch (error) {
            console.error("Failed to add criteria", error);
        }
    };

    const handleDelete = async (id) => {
        try {
            await axios.delete(`${API_URL}/${id}`);
            fetchChecklist();
        } catch (error) {
            console.error("Failed to delete criteria", error);
        }
    };

    const startEdit = (item) => {
        setEditingId(item._id);
        setEditValue(item.criteria);
    };

    const handleUpdate = async (id) => {
        if (!editValue.trim()) return;
        try {
            await axios.put(`${API_URL}/${id}`, { criteria: editValue });
            setEditingId(null);
            fetchChecklist();
        } catch (error) {
            console.error("Failed to update criteria", error);
        }
    };

    return (
        <div className="admin-panel">
            <h3>QA Checklist Manager</h3>

            {/* Add New Criteria */}
            <form onSubmit={handleAdd} className="add-criteria-form">
                <input
                    type="text"
                    placeholder="Add new compliance rule..."
                    value={newCriteria}
                    onChange={(e) => setNewCriteria(e.target.value)}
                />
                <button type="submit">Add Rule</button>
            </form>

            {/* List Existing Criteria */}
            <ul className="criteria-list">
                {checklist.map((item) => (
                    <li key={item._id} className="criteria-item">
                        {editingId === item._id ? (
                            <div className="edit-mode">
                                <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                />
                                <button onClick={() => handleUpdate(item._id)}>Save</button>
                                <button onClick={() => setEditingId(null)}>Cancel</button>
                            </div>
                        ) : (
                            <div className="view-mode">
                                <span>{item.criteria}</span>
                                <div className="actions">
                                    <button onClick={() => startEdit(item)}>Edit</button>
                                    <button onClick={() => handleDelete(item._id)}>Delete</button>
                                </div>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}