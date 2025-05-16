import { signal, batch } from '@preact/signals';
import Cell from '../../components/Cell';
import { useEffect, useMemo, useState } from 'preact/hooks';
import throttle from 'lodash.throttle';
import { createClient } from '@supabase/supabase-js';
import Info from '../../components/Info';
import { useLatest, useMount } from 'react-use';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const updatesChannel = supabase.channel('grid-updates-channel', {
	config: {
		broadcast: { self: false }
	}
})

const MAX_SIZE = 40 * 40;

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
	const [infoOpen, setInfoOpen] = useState(false);
	const [lastClickedTimestamp, setUserLastClickTimestamp] = useState(0);

	const latestPendingCellUpdates = useLatest(pendingCellUpdates);
	const latestSyncInProgress = useLatest(syncIsInProgress);
	const latestlastClickedTimestamp = useLatest(lastClickedTimestamp);

	useMount(() => {

		function determineGridChunkToLoad() {
			const clientWidth = window.innerWidth;
			const clientHeight = window.innerHeight - window.innerHeight * 0.1;
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

			const _pendingCellUpdates = latestPendingCellUpdates.current;


			if (Object.keys(_pendingCellUpdates).length === 0 || !user) {
				return;
			}

			setSyncIsInProgress(true);
			const positions = Object.keys(_pendingCellUpdates).map((k) => k);
			const ids = Object.keys(_pendingCellUpdates).map((k) => _pendingCellUpdates[k].id);
			const statuses = Object.keys(_pendingCellUpdates).map((k) => _pendingCellUpdates[k].value);

			try {
				const { data, error } = await supabase.rpc('bulk_update_cells', {
					p_cell_ids: ids,
					p_statuses: statuses
				})

				if (error) {
					console.log("There was an error syncing your changes")
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
				setTotalUsers(Object.keys(newState).filter((key) => !!newState[key][0]?.userId).length)
			})
			.on('broadcast', { event: 'grid-updates' }, (ev) => {

				if (latestPendingCellUpdates.current.hasOwnProperty(ev.payload.pos)) {
					return;
				}

				if (ev.payload.pos < cellsToLoad) {
					requestAnimationFrame(() => {
						if (cellVersions[ev.payload.pos].value < ev.payload.version) {
							cellVersions[ev.payload.pos].value = ev.payload.version;
							opacity[ev.payload.pos].value = ev.payload.value ? 1 : 0.1;
						}
					});
				}
			}
			)
			.subscribe(async (status) => {
				if (status !== 'SUBSCRIBED') { return }
				await updatesChannel.track({ userStatus: 'online', userId: user?.id })
			});

		return () => updatesChannel.unsubscribe();
	}, [user]);

	function generateColor(idx = 0, vibrancy = "high") {
		// Configure color parameters based on vibrancy level
		let saturation, lightness;

		switch (vibrancy) {
			case "neon":
				saturation = 100;
				lightness = 60;
				break;
			case "vibrant":
				saturation = 90;
				lightness = 55;
				break;
			case "high":
				saturation = 85;
				lightness = 50;
				break;
			case "medium":
				saturation = 70;
				lightness = 60;
				break;
			case "pastel":
				saturation = 70;
				lightness = 80;
				break;
			default:
				saturation = 85;
				lightness = 50;
		}

		// Generate well-distributed hues across the spectrum using prime numbers
		// to avoid repetitive patterns
		const hueRange = 360;
		const goldenRatioConjugate = 0.618033988749895;

		// Use both the index and a prime-based offset to create good distribution
		const hue = (((idx * goldenRatioConjugate) % 1) * hueRange +
			((idx * 31 + 137) % hueRange)) % hueRange;

		return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%, #a#)`;
	}

	const createColors = () => {
		return Array(MAX_SIZE).fill(0).map((_, i) => generateColor(i, 'medium'));
	};

	const color = useMemo(createColors, []);

	async function handleCellClick(id: string, pos: number) {
		setUserLastClickTimestamp(Date.now());
		const currentValue = opacity[pos].value > 0.5;
		const newValue = !currentValue;

		setPendingCellUpdates((prev) => ({ ...prev, [pos]: { id, value: newValue } }));

		cooldowns[pos].value = Date.now() + 4000;

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

	function handleInfoClick() {
		if (!infoOpen) {
			setInfoOpen(true);
		}
		else {
			setInfoOpen(false);
		}
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
					<h1 className="text-2xl font-bold">
						Colors of the Internet <span className="text-xs">by Saunved</span>
						<span className="text-xs"> | {totalUsers} online now</span>
					</h1>
					<button
						className="mt-2 flex items-center justify-center hover:bg-gray-600 cursor-pointer border p-0.5 rounded-xl"
						onClick={handleInfoClick}
					>
						<span className="ml-2">Info</span>
						{
							!infoOpen ? <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-gray-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
							</svg> :
								<svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-gray-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
								</svg>
						}
					</button>
				</div>
			</div>
			{
				infoOpen ? <Info usersOnline={totalUsers} /> : null
			}

			<div className={`min-h-dvh h-full max-h-dvh min-w-full max-w-full`}
				style={{
					gridTemplateColumns: `repeat(${gridWidth}, 1fr)`,
					gridTemplateRows: `repeat(${gridHeight}, 1fr)`,
					width: '100%',
					maxWidth: '600px',
					aspectRatio: '1 / 1'
				}}
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