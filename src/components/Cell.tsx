import { memo } from "preact/compat";

const Cell = ({ id, color, opacitySignal, cooldownSignal, onClick }) => {

    if (id === 0) {
        console.log(opacitySignal.value, cooldownSignal?.value);
    }

    const opacity = opacitySignal.value;
    const cooldown = cooldownSignal?.value;
    const _color = color.replace(/#a#/g, opacity);

    return (
        <button disabled={cooldown} onClick={onClick} data-id={id} class="border-2 rounded-sm border-gray-800 w-[48px] h-[48px] cursor-pointer transition-background duration-800 ease-linear disabled:border-pink-600 disabled:cursor-not-allowed"
            style={{ backgroundColor: _color }}>
        </button>
    );
}

export default memo(Cell, (prevProps, nextProps) => {
    return prevProps.color === nextProps.color &&
        prevProps.cooldownSignal.value === nextProps.cooldownSignal.value &&
        prevProps.opacitySignal.value === nextProps.opacitySignal.value;
});