import { signal, batch } from '@preact/signals';
import Cell from '../../components/Cell';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import throttle from 'lodash.throttle';
import { createClient } from '@supabase/supabase-js';
import Info from '../../components/Info';
import { useLatest, useMount } from 'react-use';
import { generateColor } from '../../helpers/colors';

const MAX_SIZE = 40 * 40;

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const updatesChannel = supabase.channel('grid-updates-channel', {
	config: {
		broadcast: { self: false }
	}
})

export function Home() {
	const [gridNo, setGridNo] = useState(-1);
	const [user, setUser] = useState(null);
	const [totalUsers, setTotalUsers] = useState(0);
	const [pendingCellUpdates, setPendingCellUpdates] = useState({});
	const [gridFetchingError, setGridFetchingError] = useState(false);
	const cooldowns = useMemo(() => Array.from({ length: MAX_SIZE }, () => signal(0)), []);
	const opacity = useMemo(() => Array.from({ length: MAX_SIZE }, () => signal(0.2)), []);
	const cellVersions = useMemo(() => Array.from({ length: MAX_SIZE }, () => signal(0)), []);
	const [syncIsInProgress, setSyncIsInProgress] = useState(false);
	const [gridWidth, setGridWidth] = useState(0);
	const [gridHeight, setGridHeight] = useState(0);
	const [cellsToLoad, setCellsToLoad] = useState(0);
	const [cells, setCells] = useState([]);
	const [lastClickedTimestamp, setUserLastClickTimestamp] = useState(0);
	const [tabIsActive, setTabIsActive] = useState(true);

	const latestPendingCellUpdates = useLatest(pendingCellUpdates);
	const latestSyncInProgress = useLatest(syncIsInProgress);
	const latestlastClickedTimestamp = useLatest(lastClickedTimestamp);
	const [simulationIsOn, setSimulationIsOn] = useState(false);
	const simulationIntervalRef = useRef(null);
	const [userHasSubscribed, setUserHasSubscribed] = useState(false);

	useMount(() => {

		function determineGridChunkToLoad() {
			const clientWidth = window.innerWidth;
			const clientHeight = window.innerHeight + window.innerHeight * 0.2;
			const gridHeight = Math.floor(clientHeight / 48);
			const gridWidth = Math.floor(clientWidth / 48);
			const cellsToLoad = gridHeight * gridWidth;
			setGridWidth(gridWidth);
			setGridHeight(gridHeight);
			setCellsToLoad(cellsToLoad);
		}

		determineGridChunkToLoad();
	})

	useMount(() => {
		async function createOrReuseUserSession() {

			const { data: { user } } = await supabase.auth.getUser()

			if (user) {
				setUser(user);
				return;
			}

			const { data, error } = await supabase.auth.signInAnonymously()
			if (error) {
				console.error('Error signing in:', error);
			} else {
				console.debug('User signed in:', data.user);
				setUser(data.user);
			}
		}

		createOrReuseUserSession();
	})

	// This is a centralized cooldown tracker
	// that removes cooldowns from cells. It's not super accurate,
	// but it works for what we need.
	useMount(() => {
		setInterval(() => {
			cooldowns.forEach((cooldown, i) => {
				if (cooldown.value > 0 && cooldown.value < Date.now()) {
					cooldown.value = 0;
				}
			})
		}, 500)
	})

	useMount(() => {
		const handleVisibilityChange = () => {
			console.log("Tab is active:", !document.hidden);
			setTabIsActive(!document.hidden);
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	});

	useEffect(() => {
		if (!userHasSubscribed) {
			return;
		}

		if (tabIsActive) {
			console.debug("User online")
			updatesChannel.track({ userStatus: 'online', userId: user?.id })
		} else {
			console.debug("User offline")
			updatesChannel.untrack();
		}
	}, [tabIsActive])

	useEffect(() => {

		if (totalUsers > 5 || !gridNo || !user || !tabIsActive) {
			if (simulationIntervalRef.current) {
				clearInterval(simulationIntervalRef.current);
				simulationIntervalRef.current = null;
				setSimulationIsOn(false)
			}
			return;
		}

		setSimulationIsOn(true)
		simulationIntervalRef.current = setInterval(() => {
			// The more users, the slower we want simulation to be.
			const randomDelay = 350 * totalUsers;
			setTimeout(() => {
				if (!cells.length) return;
				const randomIndex = Math.floor(Math.random() * cells.length);
				const cell = cells[randomIndex];
				if (cell && cooldowns[randomIndex].value === 0) {
					handleCellClick(cell.id, randomIndex, true);
				}
			}, randomDelay);
		}, 350 * totalUsers);

		return () => simulationIntervalRef.current ? clearInterval(simulationIntervalRef.current) : null;


	}, [totalUsers, gridNo, user, lastClickedTimestamp, tabIsActive])

	// Obtain the latest grid from the database on startup
	useEffect(() => {

		if (!cellsToLoad) {
			return;
		}

		const getLatestGrid = async () => {

			try {
				const { data: grid, error: gridError } = await supabase
					.from('grids')
					.select('id, grid_no, created_at, size')
					.order('grid_no', { ascending: false })
					.limit(1)
					.single();

				if (gridError) {
					setGridFetchingError(true);
				}

				const { data: cellsData, error: cellsError } = await supabase
					.from('cells')
					.select('id, status, pos, version')
					.eq('grid_id', grid.id)
					.filter('pos', 'lte', cellsToLoad)

				if (Array.isArray(cellsData)) {
					cellsData.sort((a, b) => a.pos - b.pos);
				}

				requestAnimationFrame(() => {
					batch(() => {
						for (let i = 0; i < cellsToLoad; i++) {
							if (cellVersions[i].value < cellsData[i].version) {
								opacity[i].value = cellsData[i].status ? 1 : 0.1;
								cellVersions[i].value = cellsData[i].version;
							}
						}
					})
				})

				setCells(cellsData);
				setGridNo(grid.grid_no)

			} catch (error) {
				return null;
			}
		};

		getLatestGrid();

		// Poll periodically so we always have the latest grid
		// Don't sync to DB if the user is still actively clicking, otherwise this causes a fake flash
		setInterval(() => {
			if (!latestSyncInProgress.current && latestlastClickedTimestamp.current + 1000 < Date.now()) {
				getLatestGrid();
			}
		}, 3000)

	}, [cellsToLoad]);

	useEffect(() => {

		async function syncToDb() {
			const pendingUpdates = latestPendingCellUpdates.current;

			if (Object.keys(pendingUpdates).length === 0 || !user) {
				return;
			}

			setSyncIsInProgress(true);
			const positions = Object.keys(pendingUpdates).map((k) => k);
			const ids = Object.keys(pendingUpdates).map((k) => pendingUpdates[k].id);
			const statuses = Object.keys(pendingUpdates).map((k) => pendingUpdates[k].value);

			try {
				const { data, error } = await supabase.rpc('bulk_update_cells', {
					p_cell_ids: ids,
					p_statuses: statuses
				})

				if (error) {
					console.error("There was an error syncing your changes")
					return;
				}

				// This is done to ensure that any pending updates that were
				// while the above sync was running are retained.
				// We don't want to do this BEFORE the actual sync is done
				// in order to prevent issues in case of errors.
				setPendingCellUpdates((prev) => {
					const newState = { ...prev };
					positions.forEach(pos => {
						delete newState[pos];
					})
					return newState;
				});

			} catch (error) {
				console.log(error)
				return;
			} finally {
				setSyncIsInProgress(false);
			}

			setSyncIsInProgress(false);
		}

		const interval = setInterval(() => {
			syncToDb();
		}, 1000);

		return () => clearInterval(interval)

	}, [user]);

	// Broadcast user clicks globally after the user is logged in
	// Also sync total users count (presence)
	useEffect(() => {

		if (!user) {
			return;
		}

		updatesChannel
			.on('presence', { event: 'sync' }, () => {
				const newState = updatesChannel.presenceState()
				// @ts-ignore
				setTotalUsers(Object.keys(newState).filter((key) => newState[key][0]?.userStatus === 'online' && !!newState[key][0]?.userId).length)
			})
			.on('broadcast', { event: 'grid-updates' }, (ev) => {

				const { pos: cellPosition, value: receivedValue, version: receivedVersion } = ev.payload;

				if (latestPendingCellUpdates.current.hasOwnProperty(cellPosition)) {
					return;
				}

				if (cellPosition < cellsToLoad) {
					requestAnimationFrame(() => {
						if (cellVersions[cellPosition].value < receivedVersion) {
							cellVersions[cellPosition].value = receivedVersion;
							opacity[cellPosition].value = receivedValue ? 1 : 0.1;
						}
					});
				}
			}
			)
			.subscribe(async (status) => {
				if (status !== 'SUBSCRIBED') { return }
				setUserHasSubscribed(true);
				await updatesChannel.track({ userStatus: 'online', userId: user?.id })
			});

		return () => updatesChannel.unsubscribe().then(() => setUserHasSubscribed(false));
	}, [user]);

	const createColors = () => {
		return Array(MAX_SIZE).fill(0).map((_, i) => generateColor(i, 'medium'));
	};

	const color = useMemo(createColors, []);

	async function handleCellClick(id: string, pos: number, clickIsSimulated = false) {
		setUserLastClickTimestamp(Date.now());
		const currentValue = opacity[pos].value > 0.5;
		const newValue = !currentValue;

		setPendingCellUpdates((prev) => ({ ...prev, [pos]: { id, value: newValue } }));

		cooldowns[pos].value = Date.now() + (!clickIsSimulated ? 4000 : 0);

		// This updates it in the state for everyone else
		updatesChannel
			.send({
				type: 'broadcast',
				event: 'grid-updates',
				payload: {
					pos,
					value: newValue,
					version: cellVersions[pos].value + 1,
					userId: user?.id,
					timestamp: Date.now()
				},
			}).then(() => console.debug("Sent", pos, newValue))

		opacity[pos].value = newValue ? 1 : 0.1;
		setUserLastClickTimestamp(Date.now());
	}

	const throttledHandleCellClick = throttle(handleCellClick, 250);

	if (gridFetchingError) {
		return (
			<div className="p-8 mx-8 border-gray-500 text-xl text-center mt-8 border rounded-md">
				There was an error fetching the grid. Please try again later.
			</div>
		)
	}

	return (
		<div className="">
			<div className="px-4 pb-6">
				<div className="p-1 flex justify-between items-center border-b border-gray-500 py-4">
					<h1 className="text-xl font-bold">
						Colors of the Internet
						<span className="text-xs"> <span className="mx-1">|</span> {totalUsers} online</span>
					</h1>
					<Info usersOnline={totalUsers} simulationIsOn={simulationIsOn} />
				</div>
			</div>

			<div className={`min-h-dvh h-full max-h-dvh min-w-full max-w-full`}
				style={{
					gridTemplateColumns: `repeat(${gridWidth}, 1fr)`,
					gridTemplateRows: `repeat(${gridHeight}, 1fr)`,
					width: '100%',
					maxWidth: '600px',
					aspectRatio: '1 / 1'
				}} q
			>
				{user && !gridFetchingError && gridNo > 0 && cells.map((c, pos) => (
					<Cell
						key={c.id}
						id={pos}
						color={color[pos]}
						opacitySignal={opacity[pos]}
						cooldownSignal={cooldowns[pos]}
						onClick={() => throttledHandleCellClick(c.id, pos)}
					/>
				))}
			</div>
		</div>
	);
}